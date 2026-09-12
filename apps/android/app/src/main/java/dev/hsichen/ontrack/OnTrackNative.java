package dev.hsichen.ontrack;

import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.provider.Settings;
import android.util.Base64;
import android.view.HapticFeedbackConstants;
import androidx.core.view.WindowCompat;
import com.android.billingclient.api.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.UpdateAvailability;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.List;
import java.util.Set;

@CapacitorPlugin(name = "OnTrackNative")
public class OnTrackNative extends Plugin {
  private static final String PRODUCT = "ontrack.supporter_pack";
  private static final Set<String> ICONS = Set.of("primary", "dark", "sage", "amethyst", "ember");
  private BillingClient billing;
  private PluginCall purchaseCall;
  private ProductDetails product;
  private int updateVersion;

  private SharedPreferences prefs() {
    return getContext().getSharedPreferences("ontrack_native", 0);
  }

  @Override
  public void load() {
    billing =
        BillingClient.newBuilder(getContext())
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection()
            .setListener(
                (result, purchases) -> {
                  PluginCall pending = purchaseCall;
                  purchaseCall = null;
                  if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
                    if (pending != null) pending.reject("cancelled");
                  } else if (result.getResponseCode() == BillingClient.BillingResponseCode.OK
                      && purchases != null) {
                    processPurchases(purchases);
                    if (pending != null) pending.resolve(stateValue());
                  } else if (pending != null) pending.reject("unavailable");
                })
            .build();
  }

  private boolean verify(Purchase purchase) {
    if (BuildConfig.PLAY_BILLING_PUBLIC_KEY.isEmpty()) return false;
    try {
      Signature signature = Signature.getInstance("SHA1withRSA");
      signature.initVerify(
          KeyFactory.getInstance("RSA")
              .generatePublic(
                  new X509EncodedKeySpec(
                      Base64.decode(BuildConfig.PLAY_BILLING_PUBLIC_KEY, Base64.DEFAULT))));
      signature.update(
          purchase.getOriginalJson().getBytes(java.nio.charset.StandardCharsets.UTF_8));
      return signature.verify(Base64.decode(purchase.getSignature(), Base64.DEFAULT));
    } catch (Exception error) {
      return false;
    }
  }

  private void processPurchases(List<Purchase> purchases) {
    boolean supporter = false;
    for (Purchase purchase : purchases) {
      if (!purchase.getProducts().contains(PRODUCT)
          || purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED
          || !verify(purchase)) continue;
      supporter = true;
      if (!purchase.isAcknowledged()) {
        billing.acknowledgePurchase(
            AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchase.getPurchaseToken())
                .build(),
            result -> {});
      }
    }
    prefs().edit().putBoolean("supporter", supporter).apply();
  }

  private JSObject stateValue() {
    JSObject state = new JSObject();
    state.put("supporter", prefs().getBoolean("supporter", false));
    state.put("icon", prefs().getString("icon", "primary"));
    state.put(
        "billingAvailable", product != null && !BuildConfig.PLAY_BILLING_PUBLIC_KEY.isEmpty());
    if (product != null && product.getOneTimePurchaseOfferDetails() != null)
      state.put("price", product.getOneTimePurchaseOfferDetails().getFormattedPrice());
    if (updateVersion > prefs().getInt("ignoredUpdate", 0))
      state.put("updateVersion", updateVersion);
    return state;
  }

  private void refreshPurchases(PluginCall call, boolean strict) {
    billing.queryPurchasesAsync(
        QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
        (result, purchases) -> {
          if (result.getResponseCode() == BillingClient.BillingResponseCode.OK)
            processPurchases(purchases);
          else if (strict) {
            call.reject("unavailable");
            return;
          }
          billing.queryProductDetailsAsync(
              QueryProductDetailsParams.newBuilder()
                  .setProductList(
                      List.of(
                          QueryProductDetailsParams.Product.newBuilder()
                              .setProductId(PRODUCT)
                              .setProductType(BillingClient.ProductType.INAPP)
                              .build()))
                  .build(),
              (productResult, details) -> {
                product =
                    details.getProductDetailsList().isEmpty()
                        ? null
                        : details.getProductDetailsList().get(0);
                call.resolve(stateValue());
              });
        });
  }

  private void connect(PluginCall call, boolean strict) {
    getActivity()
        .runOnUiThread(
            () -> {
              if (billing.isReady()) {
                refreshPurchases(call, strict);
                return;
              }
              billing.startConnection(
                  new BillingClientStateListener() {
                    @Override
                    public void onBillingSetupFinished(BillingResult result) {
                      if (result.getResponseCode() == BillingClient.BillingResponseCode.OK)
                        refreshPurchases(call, strict);
                      else if (strict) call.reject("unavailable");
                      else call.resolve(stateValue());
                    }

                    @Override
                    public void onBillingServiceDisconnected() {}
                  });
            });
  }

  @PluginMethod
  public void locale(PluginCall call) {
    // Reply after the WebView message listener has installed the current document's reply proxy.
    getActivity()
        .runOnUiThread(
            () -> {
              JSObject result = new JSObject();
              result.put(
                  "language",
                  getContext().getResources().getConfiguration().getLocales().toLanguageTags());
              call.resolve(result);
            });
  }

  @PluginMethod
  public void state(PluginCall call) {
    AppUpdateManagerFactory.create(getContext())
        .getAppUpdateInfo()
        .addOnCompleteListener(
            task -> {
              if (task.isSuccessful()
                  && task.getResult().updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE)
                updateVersion = task.getResult().availableVersionCode();
              connect(call, false);
            });
  }

  @PluginMethod
  public void restore(PluginCall call) {
    connect(call, true);
  }

  @PluginMethod
  public void purchase(PluginCall call) {
    if (purchaseCall != null
        || !billing.isReady()
        || BuildConfig.PLAY_BILLING_PUBLIC_KEY.isEmpty()) {
      call.reject("unavailable");
      return;
    }
    // Fetch fresh product details before every purchase; offers can change.
    billing.queryProductDetailsAsync(
        QueryProductDetailsParams.newBuilder()
            .setProductList(
                List.of(
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(PRODUCT)
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build()))
            .build(),
        (result, details) -> {
          if (result.getResponseCode() != BillingClient.BillingResponseCode.OK
              || details.getProductDetailsList().isEmpty()) {
            call.reject("unavailable");
            return;
          }
          product = details.getProductDetailsList().get(0);
          BillingFlowParams.ProductDetailsParams.Builder item =
              BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product);
          if (product.getOneTimePurchaseOfferDetails() != null
              && product.getOneTimePurchaseOfferDetails().getOfferToken() != null)
            item.setOfferToken(product.getOneTimePurchaseOfferDetails().getOfferToken());
          purchaseCall = call;
          getActivity()
              .runOnUiThread(
                  () -> {
                    BillingResult launch =
                        billing.launchBillingFlow(
                            getActivity(),
                            BillingFlowParams.newBuilder()
                                .setProductDetailsParamsList(List.of(item.build()))
                                .build());
                    if (launch.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                      purchaseCall = null;
                      call.reject("unavailable");
                    }
                  });
        });
  }

  @PluginMethod
  public void setIcon(PluginCall call) {
    String icon = call.getString("icon", "primary");
    if (!ICONS.contains(icon) || !prefs().getBoolean("supporter", false)) {
      call.reject("unavailable");
      return;
    }
    PackageManager pm = getContext().getPackageManager();
    pm.setComponentEnabledSetting(
        new ComponentName(getContext(), getContext().getPackageName() + ".Icon_" + icon),
        PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
        PackageManager.DONT_KILL_APP);
    for (String other : ICONS)
      if (!icon.equals(other))
        pm.setComponentEnabledSetting(
            new ComponentName(getContext(), getContext().getPackageName() + ".Icon_" + other),
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP);
    prefs().edit().putString("icon", icon).apply();
    call.resolve();
  }

  @PluginMethod
  public void appearance(PluginCall call) {
    boolean dark = call.getBoolean("dark", false);
    String background = call.getString("background", "#f8fafc");
    getActivity()
        .runOnUiThread(
            () -> {
              try {
                getBridge().getWebView().setBackgroundColor(Color.parseColor(background));
                getActivity()
                    .getWindow()
                    .getDecorView()
                    .setBackgroundColor(Color.parseColor(background));
                WindowCompat.getInsetsController(
                        getActivity().getWindow(), getBridge().getWebView())
                    .setAppearanceLightStatusBars(!dark);
                WindowCompat.getInsetsController(
                        getActivity().getWindow(), getBridge().getWebView())
                    .setAppearanceLightNavigationBars(!dark);
                call.resolve();
              } catch (IllegalArgumentException error) {
                call.reject("Invalid theme");
              }
            });
  }

  @PluginMethod
  public void haptic(PluginCall call) {
    getActivity()
        .runOnUiThread(
            () -> {
              getBridge().getWebView().performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
              call.resolve();
            });
  }

  @PluginMethod
  public void share(PluginCall call) {
    String text = call.getString("text", "");
    getActivity()
        .runOnUiThread(
            () -> {
              getActivity()
                  .startActivity(
                      Intent.createChooser(
                          new Intent(Intent.ACTION_SEND)
                              .setType("text/plain")
                              .putExtra(Intent.EXTRA_TEXT, text),
                          null));
              call.resolve();
            });
  }

  @PluginMethod
  public void ignoreUpdate(PluginCall call) {
    prefs().edit().putInt("ignoredUpdate", call.getInt("version", 0)).apply();
    call.resolve();
  }

  @PluginMethod
  public void openStore(PluginCall call) {
    getActivity()
        .startActivity(
            new Intent(
                Intent.ACTION_VIEW,
                Uri.parse(
                    "https://play.google.com/store/apps/details?id="
                        + getContext().getPackageName())));
    call.resolve();
  }

  @PluginMethod
  public void openLocationSettings(PluginCall call) {
    getActivity()
        .startActivity(
            new Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getContext().getPackageName())));
    call.resolve();
  }

  @PluginMethod
  public void saveWidget(PluginCall call) {
    String snapshot = call.getString("snapshot", "");
    if (snapshot.length() > 1000000) {
      call.reject("Snapshot too large");
      return;
    }
    prefs().edit().putString("widget", snapshot).apply();
    TrainWidget.updateAll(getContext());
    call.resolve();
  }

  @Override
  protected void handleOnDestroy() {
    if (billing != null) billing.endConnection();
  }
}
