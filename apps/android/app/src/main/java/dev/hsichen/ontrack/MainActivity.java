package dev.hsichen.ontrack;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onConfigurationChanged(android.content.res.Configuration configuration) {
    super.onConfigurationChanged(configuration);
    if (bridge != null)
      bridge
          .getWebView()
          .evaluateJavascript("window.dispatchEvent(new Event('languagechange'))", null);
  }

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(OnTrackNative.class);
    super.onCreate(savedInstanceState);
    if (BuildConfig.DEBUG && getIntent().getBooleanExtra("ontrackShowcase", false)) {
      bridge.getWebView().loadUrl("https://localhost/app.html?showcase");
    }
    getOnBackPressedDispatcher()
        .addCallback(
            this,
            new OnBackPressedCallback(true) {
              @Override
              public void handleOnBackPressed() {
                bridge
                    .getWebView()
                    .evaluateJavascript(
                        "window.dispatchEvent(new Event('ontrack-back', {cancelable:true}))",
                        result -> {
                          if (!"false".equals(result)) moveTaskToBack(true);
                        });
              }
            });
  }
}
