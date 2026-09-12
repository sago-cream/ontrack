import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.security.cert.*;
import java.util.*;
import java.util.jar.*;

/** Validate upload keys and every signed bundle entry without printing key material. */
class AndroidSigningCheck {
  public static void main(String[] args) {
    try {
      if (args.length != 2)
        throw new IllegalArgumentException("Expected signing <android-dir> or bundle <aab>");
      if (args[0].equals("billing")) {
        String key = System.getenv("PLAY_BILLING_PUBLIC_KEY");
        if (key == null || key.isBlank())
          throw new IllegalArgumentException("Missing PLAY_BILLING_PUBLIC_KEY");
        var publicKey =
            KeyFactory.getInstance("RSA")
                .generatePublic(
                    new java.security.spec.X509EncodedKeySpec(
                        Base64.getDecoder().decode(key.replaceAll("\\s", ""))));
        if (((java.security.interfaces.RSAPublicKey) publicKey).getModulus().bitLength() < 2048)
          throw new IllegalArgumentException("Billing public key must be RSA 2048-bit or stronger");
        System.out.println("Play Billing public key is valid RSA.");
        return;
      }
      X509Certificate certificate;
      if (args[0].equals("signing")) {
        Path root = Path.of(args[1]);
        String store = setting("ANDROID_KEYSTORE_PATH");
        String password = setting("ANDROID_KEYSTORE_PASSWORD");
        String alias = setting("ANDROID_KEY_ALIAS");
        String keyPassword = setting("ANDROID_KEY_PASSWORD");
        if (!Path.of(store).isAbsolute())
          throw new IllegalArgumentException("ANDROID_KEYSTORE_PATH must be absolute");
        KeyStore keys = KeyStore.getInstance(root.resolve(store).toFile(), password.toCharArray());
        if (!(keys.getKey(alias, keyPassword.toCharArray()) instanceof PrivateKey))
          throw new IllegalArgumentException("Upload alias does not contain a private key");
        certificate = (X509Certificate) keys.getCertificate(alias);
      } else if (args[0].equals("bundle")) {
        certificate = verifyBundle(Path.of(args[1]));
      } else throw new IllegalArgumentException("Unknown signing check");
      certificate.checkValidity();
      if (certificate.getSubjectX500Principal().getName().contains("CN=Android Debug"))
        throw new IllegalArgumentException("Android debug keys cannot be used for a Play release");
      String fingerprint =
          HexFormat.of()
              .formatHex(MessageDigest.getInstance("SHA-256").digest(certificate.getEncoded()));
      System.out.println("Upload certificate SHA-256: " + fingerprint);
    } catch (Exception error) {
      // Library errors can contain private paths. Only our configuration errors are printed.
      String detail =
          error instanceof IllegalArgumentException
              ? error.getMessage()
              : error.getClass().getSimpleName();
      System.err.println(
          "Signing check failed: "
              + detail
              + ". Check the keystore, alias, passwords, and certificate validity.");
      System.exit(1);
    }
  }

  private static String setting(String variable) {
    String value = System.getenv(variable);

    if (value == null || value.isEmpty()) throw new IllegalArgumentException("Missing " + variable);
    return value;
  }

  private static X509Certificate verifyBundle(Path path) throws Exception {
    X509Certificate signer = null;
    int entries = 0;
    try (JarFile jar = new JarFile(path.toFile(), true)) {
      var iterator = jar.entries();
      while (iterator.hasMoreElements()) {
        JarEntry entry = iterator.nextElement();
        if (entry.isDirectory() || entry.getName().startsWith("META-INF/")) continue;
        try (var stream = jar.getInputStream(entry)) {
          stream.transferTo(OutputStream.nullOutputStream());
        }
        var certificates = entry.getCertificates();
        if (certificates == null || certificates.length == 0)
          throw new IllegalArgumentException("Bundle contains unsigned content");
        X509Certificate current = (X509Certificate) certificates[0];
        if (signer != null && !signer.equals(current))
          throw new IllegalArgumentException("Bundle contains mixed signing certificates");
        signer = current;
        entries++;
      }
    }
    if (entries == 0 || signer == null)
      throw new IllegalArgumentException("Bundle has no signed content");
    return signer;
  }
}
