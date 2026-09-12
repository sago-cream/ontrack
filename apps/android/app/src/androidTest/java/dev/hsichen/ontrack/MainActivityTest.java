package dev.hsichen.ontrack;

import static org.junit.Assert.*;

import android.content.Context;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class MainActivityTest {

    @Test
    public void packageNameMatchesPlayListing() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();

        assertEquals("dev.hsichen.ontrack", appContext.getPackageName());
    }

    @Test
    public void launchesBundledAppRoute() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                WebView webView = activity.getBridge().getWebView();

                assertNotNull(webView);
                assertTrue(webView.getUrl().endsWith("/app.html"));
            });
        }
    }
}
