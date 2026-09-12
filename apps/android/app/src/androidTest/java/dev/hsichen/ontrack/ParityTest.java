package dev.hsichen.ontrack;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ParityTest {
  private static final Context context =
      InstrumentationRegistry.getInstrumentation().getTargetContext();

  private static File outputDirectory() {
    String directory = InstrumentationRegistry.getArguments().getString("additionalTestOutputDir");
    File output = directory == null ? context.getExternalFilesDir(null) : new File(directory);
    output.mkdirs();
    return output;
  }

  private String js(ActivityScenario<MainActivity> scenario, String script) throws Exception {
    AtomicReference<String> value = new AtomicReference<>();
    CountDownLatch done = new CountDownLatch(1);
    scenario.onActivity(
        activity ->
            activity
                .getBridge()
                .getWebView()
                .evaluateJavascript(
                    script,
                    result -> {
                      value.set(result);
                      done.countDown();
                    }));
    assertTrue("JavaScript callback timed out", done.await(10, TimeUnit.SECONDS));
    return value.get();
  }

  private void ready(ActivityScenario<MainActivity> scenario, String condition) throws Exception {
    for (int i = 0; i < 100; i++) {
      if ("true".equals(js(scenario, condition))) return;
      Thread.sleep(100);
    }
    fail("UI did not reach: " + condition);
  }

  private void capture(String name) throws Exception {
    Thread.sleep(800);
    Bitmap screenshot =
        InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
    assertNotNull(screenshot);
    screenshot.setHasAlpha(false);
    File file = new File(outputDirectory(), name + ".png");
    try (FileOutputStream output = new FileOutputStream(file)) {
      screenshot.compress(Bitmap.CompressFormat.PNG, 100, output);
    }
  }

  @Test
  public void mainSettingsTimeSearchAndThemes() throws Exception {
    String locale = InstrumentationRegistry.getArguments().getString("ontrackLocale");
    if (locale != null && android.os.Build.VERSION.SDK_INT >= 33) {
      context
          .getSystemService(android.app.LocaleManager.class)
          .setApplicationLocales(android.os.LocaleList.forLanguageTags(locale));
    }
    context.getSharedPreferences("ontrack_native", 0).edit().putBoolean("supporter", true).apply();
    Intent intent = new Intent(context, MainActivity.class).putExtra("ontrackShowcase", true);
    try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(intent)) {
      ready(
          scenario,
          "document.querySelectorAll('.train-card:not(.skeleton-card)').length === 3 &&"
              + " document.querySelector('.train-card.selected') !== null");
      assertEquals("\"true\"", js(scenario, "document.documentElement.dataset.native"));
      assertEquals(
          "\"76px\"",
          js(scenario, "getComputedStyle(document.querySelector('.train-card')).height"));
      assertEquals("true", js(scenario, "document.documentElement.scrollWidth <= innerWidth"));
      if (locale != null)
        ready(
            scenario,
            "document.documentElement.lang === '"
                + (locale.startsWith("en") ? "en" : "zh-TW")
                + "'");
      capture("android-main");
      js(scenario, "document.querySelectorAll('.train-card')[1].click()");
      ready(
          scenario,
          "document.querySelectorAll('.train-card')[1].getAttribute('aria-pressed') === 'true'");
      js(scenario, "document.querySelector('.app-toolbar-button:last-child').click()");
      ready(scenario, "document.querySelector('.settings-sheet') !== null");
      assertEquals(
          "true",
          js(scenario, "!document.querySelector('.settings-list').textContent.includes('語言')"));
      capture("android-settings");
      ready(scenario, "document.querySelector('.theme-ember') !== null");
      for (String theme : new String[] {"dark", "sage", "amethyst", "ember", "light"}) {
        js(scenario, "document.querySelector('.theme-" + theme + "').parentElement.click()");
        ready(scenario, "document.documentElement.dataset.theme === '" + theme + "'");
        capture("android-settings-" + theme);
      }
      js(scenario, "document.querySelector('.settings-navigation-button').click()");
      ready(scenario, "document.querySelector('.message-template-input') !== null");
      capture("android-message-editor");
      js(scenario, "window.dispatchEvent(new Event('ontrack-back', {cancelable:true}))");
      ready(scenario, "document.querySelector('.theme-picker') !== null");
      js(scenario, "window.dispatchEvent(new Event('ontrack-back', {cancelable:true}))");
      ready(scenario, "document.querySelector('.settings-sheet') === null");
      assertEquals(
          "true",
          js(
              scenario,
              "document.querySelectorAll('.train-card')[1].getAttribute('aria-pressed') ==="
                  + " 'true'"));
      js(scenario, "document.querySelector('.app-toolbar-button:last-child').click()");
      ready(scenario, "document.querySelector('.settings-header') !== null");
      js(
          scenario,
          "(() => { const target = document.querySelector('.settings-header'); const start = new"
              + " Touch({identifier:1,target,clientY:100}); const end = new"
              + " Touch({identifier:1,target,clientY:220}); target.dispatchEvent(new"
              + " TouchEvent('touchstart',{bubbles:true,touches:[start]}));"
              + " target.dispatchEvent(new"
              + " TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[end]}));"
              + " target.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[]}));"
              + " })()");
      ready(scenario, "document.querySelector('.settings-sheet') === null");
      js(scenario, "document.querySelector('.time-selector-trigger').click()");
      ready(scenario, "document.querySelector('.time-editor-sheet') !== null");
      capture("android-time-editor");
      js(scenario, "document.querySelector('.time-editor-icon-button:last-child').click()");
      ready(scenario, "document.querySelector('.time-editor-fixed-time') !== null");
      capture("android-last-train");
      js(scenario, "window.dispatchEvent(new Event('ontrack-back', {cancelable:true}))");
      ready(scenario, "document.querySelector('.time-editor-sheet') === null");
      js(scenario, "document.querySelector('.station-row-destination .station-trigger').click()");
      ready(scenario, "document.querySelectorAll('.station-search-item').length > 0");
      assertEquals("\"\"", js(scenario, "document.querySelector('.station-search-input').value"));
      capture("android-station-search");
      js(scenario, "window.dispatchEvent(new Event('ontrack-back', {cancelable:true}))");
      ready(scenario, "document.querySelector('.station-search-overlay') === null");
      capture("android-main-final");
    }
  }

  @Test
  public void playStoreScreenshots() throws Exception {
    org.junit.Assume.assumeTrue(android.os.Build.VERSION.SDK_INT >= 33);
    String locale = InstrumentationRegistry.getArguments().getString("ontrackLocale", "en-US");
    context
        .getSystemService(android.app.LocaleManager.class)
        .setApplicationLocales(android.os.LocaleList.forLanguageTags(locale));
    context
        .getSharedPreferences("ontrack_native", 0)
        .edit()
        .putBoolean("supporter", false)
        .commit();
    Intent intent = new Intent(context, MainActivity.class).putExtra("ontrackShowcase", true);
    try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(intent)) {
      ready(scenario, "document.querySelector('.train-card.selected') !== null");
      js(scenario, "localStorage.clear(); location.reload()");
      ready(scenario, "document.querySelector('.train-card.selected') !== null");
      ready(
          scenario,
          "document.documentElement.lang === '" + (locale.startsWith("en") ? "en" : "zh-TW") + "'");
      capture("1-main");
      js(scenario, "document.querySelector('.app-toolbar-button:last-child').click()");
      ready(scenario, "document.querySelector('.settings-sheet') !== null");
      capture("2-settings");
      js(scenario, "document.querySelector('.settings-navigation-button').click()");
      ready(scenario, "document.querySelector('.message-template-input') !== null");
      capture("3-message");
      js(scenario, "window.dispatchEvent(new Event('ontrack-back', {cancelable:true}))");
      ready(scenario, "document.querySelector('.theme-picker') !== null");
      js(scenario, "window.dispatchEvent(new Event('ontrack-back', {cancelable:true}))");
      ready(scenario, "document.querySelector('.settings-sheet') === null");
      js(scenario, "document.querySelector('.time-selector-trigger').click()");
      ready(scenario, "document.querySelector('.time-editor-sheet') !== null");
      capture("4-time");
    }
  }

  @Test
  public void widgetsRenderBothLayoutsAndThemes() throws Exception {
    var now = java.time.ZonedDateTime.now(TrainWidget.TAIPEI);
    JSONObject snapshot =
        new JSONObject()
            .put("date", now.toLocalDate().toString())
            .put("origin", "臺北")
            .put("destination", "新竹")
            .put("language", "zh-TW");
    org.json.JSONArray trains = new org.json.JSONArray();
    for (int i = 0; i < 4; i++) {
      String departure =
          String.format(java.util.Locale.ROOT, "%02d:%02d", now.getHour(), now.getMinute());
      trains.put(
          new JSONObject()
              .put("trainNo", String.valueOf(125 + i))
              .put("trainType", i == 0 ? "區間" : "自強")
              .put("departureTime", departure)
              .put("arrivalTime", TrainWidget.adjusted(departure, 76))
              .put("delay", i == 0 ? 4 : 0)
              .put("price", i == 0 ? 322 : 500));
    }
    snapshot.put("trains", trains);
    snapshot.put("messageTemplate", "{{origin}} → {{destination}} {{arrivalTime}} {{unknown}}");
    assertEquals(
        "臺北 → 新竹 "
            + TrainWidget.adjusted(trains.getJSONObject(0).getString("arrivalTime"), 4)
            + " {{unknown}}",
        TrainWidget.shareMessage(snapshot, trains.getJSONObject(0)));

    assertEquals(3, TrainWidget.nextTrains(snapshot, now).size());
    snapshot.put("date", now.minusDays(1).toLocalDate().toString());
    assertTrue(TrainWidget.nextTrains(snapshot, now).isEmpty());
    snapshot.put("date", now.toLocalDate().toString());
    for (String theme : new String[] {"light", "dark", "sage", "amethyst", "ember"}) {
      snapshot.put("appearance", theme);
      context
          .getSharedPreferences("ontrack_native", 0)
          .edit()
          .putString("widget", snapshot.toString())
          .commit();
      for (boolean comparison : new boolean[] {false, true}) {
        AtomicReference<Bitmap> bitmap = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation()
            .runOnMainSync(
                () -> {
                  RemoteViews remote = TrainWidget.render(context, comparison);
                  View view = remote.apply(context, new FrameLayout(context));
                  float density = context.getResources().getDisplayMetrics().density;
                  int width = Math.round(360 * density), height = Math.round(180 * density);
                  view.measure(
                      View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                      View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
                  view.layout(0, 0, width, height);
                  Bitmap image = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
                  view.draw(new Canvas(image));
                  bitmap.set(image);
                });
        try (FileOutputStream output =
            new FileOutputStream(
                new File(
                    outputDirectory(),
                    "widget-" + (comparison ? "routes-" : "train-") + theme + ".png"))) {
          bitmap.get().compress(Bitmap.CompressFormat.PNG, 100, output);
        }
      }
    }
  }
}
