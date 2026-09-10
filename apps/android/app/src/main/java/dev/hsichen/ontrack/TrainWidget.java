package dev.hsichen.ontrack;

import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.view.View;
import android.widget.RemoteViews;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

public class TrainWidget extends AppWidgetProvider {
  static final int JOB_ID = 7401;
  static final ZoneId TAIPEI = ZoneId.of("Asia/Taipei");

  static int minutes(String clock) {
    try {
      String[] parts = clock.split(":");
      return Integer.parseInt(parts[0]) * 60 + Integer.parseInt(parts[1]);
    } catch (Exception error) {
      return -1;
    }
  }

  static String adjusted(String clock, int delay) {
    int value = Math.floorMod(minutes(clock) + delay, 1440);
    return String.format(java.util.Locale.ROOT, "%02d:%02d", value / 60, value % 60);
  }

  static String shareMessage(JSONObject snapshot, JSONObject train) {
    boolean en = snapshot.optString("language").equals("en");
    String template = snapshot.optString("messageTemplate");
    if (template.trim().isEmpty())
      template =
          en ? "Arrive at {{destination}} at {{arrivalTime}}" : "{{arrivalTime}}到{{destination}}";
    int delay = train.optInt("delay");
    int duration =
        Math.floorMod(
            minutes(train.optString("arrivalTime")) - minutes(train.optString("departureTime")),
            1440);
    String type = train.optString("trainType").split("\\(")[0].replaceAll("號$", "");
    if (en)
      type =
          switch (type) {
            case "區間" -> "Local";
            case "區間快" -> "F.Local";
            case "自強" -> "TC";
            case "莒光" -> "CK";
            case "新自強" -> "N.TC";
            case "普悠瑪" -> "Puyuma";
            case "太魯閣" -> "Taroko";
            default -> type;
          };
    java.util.Map<String, String> values = new java.util.HashMap<>();
    values.put("arrivalTime", adjusted(train.optString("arrivalTime"), delay));
    values.put("departureTime", adjusted(train.optString("departureTime"), delay));
    values.put("origin", snapshot.optString("origin"));
    values.put("destination", snapshot.optString("destination"));
    values.put("trainType", type);
    values.put("trainNumber", train.optString("trainNo"));
    values.put(
        "duration",
        duration >= 60
            ? duration / 60 + "h" + (duration % 60 == 0 ? "" : duration % 60 + "m")
            : duration + "m");
    values.put(
        "fare",
        train.has("price") && !train.isNull("price")
            ? "NT$"
                + java.text.NumberFormat.getIntegerInstance(java.util.Locale.US)
                    .format(train.optInt("price"))
            : "");
    values.put(
        "delay",
        delay > 0
            ? (en ? "Delayed " + delay + " minutes" : "誤點 " + delay + " 分鐘")
            : (en ? "On time" : "準點"));
    values.put(
        "line",
        train.optInt("tripLine") == 1
            ? (en ? "Mountain Line" : "山線")
            : train.optInt("tripLine") == 2 ? (en ? "Coast Line" : "海線") : "");
    java.util.regex.Matcher matcher =
        java.util.regex.Pattern.compile("\\{\\{(\\w+)\\}\\}").matcher(template);
    StringBuffer result = new StringBuffer();
    while (matcher.find())
      matcher.appendReplacement(
          result,
          java.util.regex.Matcher.quoteReplacement(
              values.getOrDefault(matcher.group(1), matcher.group())));
    matcher.appendTail(result);
    return result.toString().trim();
  }

  static boolean eligible(String type) {
    for (String marker :
        new String[] {"觀光", "團體", "太魯閣", "普悠瑪", "新自強", "3000", "專開", "商務", "親子", "郵輪"})
      if (type.contains(marker)) return false;
    return true;
  }

  static List<JSONObject> nextTrains(JSONObject snapshot, ZonedDateTime now) {
    List<JSONObject> result = new ArrayList<>();
    if (!snapshot.optString("date").equals(now.toLocalDate().toString())) return result;
    JSONArray trains = snapshot.optJSONArray("trains");
    if (trains == null) return result;
    for (int i = 0; i < trains.length(); i++) {
      JSONObject train = trains.optJSONObject(i);
      if (train == null
          || (snapshot.optBoolean("electronicTicketOnly")
              && !eligible(train.optString("trainType")))) continue;
      if (minutes(train.optString("departureTime")) + train.optInt("delay")
          >= now.getHour() * 60 + now.getMinute()) result.add(train);
    }
    result.sort(
        Comparator.comparingInt(
            train -> minutes(train.optString("departureTime")) + train.optInt("delay")));
    return result.subList(0, Math.min(3, result.size()));
  }

  static int[] palette(Context context, String appearance) {
    if (appearance.equals("system"))
      appearance =
          (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                  == Configuration.UI_MODE_NIGHT_YES
              ? "dark"
              : "light";
    String[] colors =
        switch (appearance) {
          case "dark" -> new String[] {"#1e293b", "#f1f5f9", "#94a3b8", "#60a5fa"};
          case "sage" -> new String[] {"#fffffc", "#192a18", "#53694a", "#659157"};
          case "amethyst" -> new String[] {"#262232", "#f5f0ff", "#bdb2d5", "#ad96da"};
          case "ember" -> new String[] {"#302a2a", "#fff6ef", "#cdb8ac", "#d16923"};
          default -> new String[] {"#ffffff", "#0f172a", "#475569", "#357de9"};
        };
    return new int[] {
      Color.parseColor(colors[0]),
      Color.parseColor(colors[1]),
      Color.parseColor(colors[2]),
      Color.parseColor(colors[3])
    };
  }

  @Override
  public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
    updateAll(context);
    schedule(context);
  }

  @Override
  public void onEnabled(Context context) {
    schedule(context);
  }

  @Override
  public void onDisabled(Context context) {
    AppWidgetManager manager = AppWidgetManager.getInstance(context);
    if (manager.getAppWidgetIds(new ComponentName(context, TrainWidget.class)).length == 0
        && manager.getAppWidgetIds(new ComponentName(context, RouteCardsWidget.class)).length
            == 0) {
      context.getSystemService(JobScheduler.class).cancel(JOB_ID);
      scheduleDeparture(context, false);
    }
  }

  static void schedule(Context context) {
    context
        .getSystemService(JobScheduler.class)
        .schedule(
            new JobInfo.Builder(JOB_ID, new ComponentName(context, WidgetRefreshService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15 * 60 * 1000L)
                .setPersisted(true)
                .build());
  }

  private static final String TICK = "dev.hsichen.ontrack.WIDGET_DEPARTURE";

  @Override
  public void onReceive(Context context, Intent intent) {
    if (TICK.equals(intent.getAction())) updateAll(context);
    else super.onReceive(context, intent);
  }

  private static void scheduleDeparture(Context context, boolean enabled) {
    var alarm = context.getSystemService(android.app.AlarmManager.class);
    PendingIntent tick =
        PendingIntent.getBroadcast(
            context,
            7403,
            new Intent(context, TrainWidget.class).setAction(TICK),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    if (!enabled) {
      alarm.cancel(tick);
      return;
    }
    ZonedDateTime now = ZonedDateTime.now(TAIPEI);
    long next = now.toLocalDate().plusDays(1).atStartOfDay(TAIPEI).toInstant().toEpochMilli();
    try {
      JSONObject snapshot =
          new JSONObject(
              context.getSharedPreferences("ontrack_native", 0).getString("widget", "{}"));
      for (JSONObject train : nextTrains(snapshot, now)) {
        long departure =
            now.toLocalDate()
                .atStartOfDay(TAIPEI)
                .plusMinutes(minutes(train.optString("departureTime")) + train.optInt("delay") + 1)
                .toInstant()
                .toEpochMilli();
        if (departure > System.currentTimeMillis()) next = Math.min(next, departure);
      }
    } catch (Exception ignored) {
    }
    // Inexact alarms update cached train selection without requesting exact-alarm access.
    // Android may defer this while idle; network refresh has its own battery-aware job.
    alarm.set(android.app.AlarmManager.RTC_WAKEUP, next, tick);
  }

  static void updateAll(Context context) {
    AppWidgetManager manager = AppWidgetManager.getInstance(context);
    boolean enabled = false;
    for (Class<?> kind : new Class<?>[] {TrainWidget.class, RouteCardsWidget.class}) {
      enabled |= manager.getAppWidgetIds(new ComponentName(context, kind)).length > 0;
      for (int id : manager.getAppWidgetIds(new ComponentName(context, kind)))
        manager.updateAppWidget(id, render(context, kind == RouteCardsWidget.class));
    }
    scheduleDeparture(context, enabled);
  }

  static RemoteViews render(Context context, boolean comparison) {
    RemoteViews views =
        new RemoteViews(
            context.getPackageName(), comparison ? R.layout.widget_routes : R.layout.widget_train);
    JSONObject snapshot;
    try {
      snapshot =
          new JSONObject(
              context.getSharedPreferences("ontrack_native", 0).getString("widget", "{}"));
    } catch (Exception error) {
      snapshot = new JSONObject();
    }
    boolean en = snapshot.optString("language").equals("en");
    int[] colors = palette(context, snapshot.optString("appearance", "system"));
    String theme = snapshot.optString("appearance", "system");
    if (theme.equals("system"))
      theme =
          (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                  == Configuration.UI_MODE_NIGHT_YES
              ? "dark"
              : "light";
    if (!java.util.Set.of("light", "dark", "sage", "amethyst", "ember").contains(theme))
      theme = "light";
    int background =
        context
            .getResources()
            .getIdentifier("widget_background_" + theme, "drawable", context.getPackageName());
    int card =
        context
            .getResources()
            .getIdentifier("widget_card_" + theme, "drawable", context.getPackageName());
    views.setInt(R.id.widget_root, "setBackgroundResource", background);
    if (!comparison) views.setInt(R.id.widget_logo, "setColorFilter", colors[3]);
    int onPrimary =
        androidx.core.graphics.ColorUtils.calculateLuminance(colors[3]) > 0.179
            ? Color.BLACK
            : Color.WHITE;
    views.setTextColor(R.id.widget_route, colors[2]);
    views.setTextViewText(
        R.id.widget_route,
        snapshot.has("origin")
            ? snapshot.optString("origin") + " → " + snapshot.optString("destination")
            : "OnTrack");
    PendingIntent open =
        PendingIntent.getActivity(
            context,
            0,
            new Intent(context, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    views.setOnClickPendingIntent(R.id.widget_root, open);
    List<JSONObject> trains = nextTrains(snapshot, ZonedDateTime.now(TAIPEI));
    int[] rowIds = {R.id.widget_row_0, R.id.widget_row_1, R.id.widget_row_2};
    int[] timeIds = {R.id.widget_time_0, R.id.widget_time_1, R.id.widget_time_2};
    int[] detailIds = {R.id.widget_detail_0, R.id.widget_detail_1, R.id.widget_detail_2};
    int[] delayIds = {R.id.widget_delay_0, R.id.widget_delay_1, R.id.widget_delay_2};
    for (int index = 0; index < (comparison ? 3 : 1); index++) {
      views.setTextColor(timeIds[index], comparison ? onPrimary : colors[1]);
      views.setTextColor(detailIds[index], comparison ? onPrimary : colors[2]);
      views.setTextColor(delayIds[index], comparison ? onPrimary : Color.parseColor("#ef4444"));
      if (comparison) views.setInt(rowIds[index], "setBackgroundResource", card);
      if (index >= trains.size()) {
        views.setViewVisibility(rowIds[index], index == 0 ? View.VISIBLE : View.GONE);
        views.setTextViewText(timeIds[index], en ? "Open OnTrack" : "開啟 OnTrack");
        views.setTextViewText(
            detailIds[index], en ? "Choose a route or refresh trains" : "選擇路線或更新班次");
        views.setTextViewText(delayIds[index], "");
        continue;
      }
      views.setViewVisibility(rowIds[index], View.VISIBLE);
      JSONObject train = trains.get(index);
      String departure = train.optString("departureTime"), arrival = train.optString("arrivalTime");
      int delay = train.optInt("delay");
      int duration = Math.floorMod(minutes(arrival) - minutes(departure), 1440);
      String durationText =
          duration >= 60
              ? duration / 60 + "h" + (duration % 60 == 0 ? "" : duration % 60 + "m")
              : duration + "m";
      if (comparison) {
        views.setTextViewText(timeIds[index], departure + " - " + arrival + " | " + durationText);
        views.setTextViewText(
            delayIds[index], delay > 0 ? (en ? delay + "m late" : "誤點" + delay + "分") : "");
      } else {
        views.setTextViewText(timeIds[index], departure);
        views.setTextViewText(R.id.widget_arrival, arrival);
        views.setTextViewText(R.id.widget_duration, "— " + durationText + " —");
        views.setTextColor(R.id.widget_arrival, colors[1]);
        views.setTextColor(R.id.widget_duration, colors[2]);
        views.setTextColor(R.id.widget_arrival_delay, Color.parseColor("#ef4444"));
        views.setTextViewText(delayIds[index], delay > 0 ? adjusted(departure, delay) : "");
        views.setTextViewText(R.id.widget_arrival_delay, delay > 0 ? adjusted(arrival, delay) : "");
      }
      String type = train.optString("trainType").split("\\(")[0].replaceAll("號$", "");
      if (en)
        type =
            switch (type) {
              case "區間" -> "Local";
              case "區間快" -> "F.Local";
              case "自強" -> "TC";
              case "莒光" -> "CK";
              case "新自強" -> "N.TC";
              case "普悠瑪" -> "Puyuma";
              case "太魯閣" -> "Taroko";
              default -> type;
            };
      String price =
          train.has("price") && !train.isNull("price") ? "  NT$" + train.optInt("price") : "";
      views.setTextViewText(detailIds[index], type + " " + train.optString("trainNo"));
      if (comparison) {
        int[] priceIds = {R.id.widget_price_0, R.id.widget_price_1, R.id.widget_price_2};
        views.setTextViewText(priceIds[index], price.trim());
        views.setTextColor(priceIds[index], onPrimary);
      }
    }
    if (!comparison) {
      views.setTextColor(R.id.widget_share, colors[3]);
      views.setTextViewText(R.id.widget_share, en ? "Share" : "分享");
      views.setViewVisibility(R.id.widget_share, trains.isEmpty() ? View.GONE : View.VISIBLE);
      if (!trains.isEmpty()) {
        JSONObject train = trains.get(0);
        String message = shareMessage(snapshot, train);
        Intent send =
            Intent.createChooser(
                    new Intent(Intent.ACTION_SEND)
                        .setType("text/plain")
                        .putExtra(Intent.EXTRA_TEXT, message),
                    null)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        views.setOnClickPendingIntent(
            R.id.widget_share,
            PendingIntent.getActivity(
                context,
                1,
                send,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
      }
    }
    return views;
  }
}
