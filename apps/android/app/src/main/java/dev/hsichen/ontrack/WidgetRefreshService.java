package dev.hsichen.ontrack;

import android.app.job.JobParameters;
import android.app.job.JobService;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URLEncoder;
import java.time.LocalDate;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.json.JSONObject;

public class WidgetRefreshService extends JobService {
  private final ExecutorService executor = Executors.newSingleThreadExecutor();
  private Future<?> work;
  private volatile JobParameters active;

  @Override
  public boolean onStartJob(JobParameters params) {
    active = params;
    work =
        executor.submit(
            () -> {
              boolean retry = false;
              HttpURLConnection connection = null;
              try {
                var prefs = getSharedPreferences("ontrack_native", 0);
                String original = prefs.getString("widget", "{}");
                JSONObject snapshot = new JSONObject(original);
                if (!snapshot.has("originId") || !snapshot.has("destinationId")) {
                  jobFinished(params, false);
                  return;
                }
                String date = LocalDate.now(TrainWidget.TAIPEI).toString();
                String url =
                    BuildConfig.ONTRACK_API_ORIGIN
                        + "/api/schedule?origin="
                        + URLEncoder.encode(snapshot.getString("originId"), "UTF-8")
                        + "&dest="
                        + URLEncoder.encode(snapshot.getString("destinationId"), "UTF-8")
                        + "&date="
                        + date;
                if (!url.startsWith("https://"))
                  throw new IllegalArgumentException("HTTPS required");
                connection = (HttpURLConnection) URI.create(url).toURL().openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(15000);
                if (connection.getResponseCode() != 200)
                  throw new IllegalStateException("Unavailable");
                java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                try (java.io.InputStream input = connection.getInputStream()) {
                  int read;
                  while ((read = input.read(buffer)) != -1) {
                    if (output.size() + read > 1000000)
                      throw new IllegalStateException("Response too large");
                    output.write(buffer, 0, read);
                  }
                }
                String body = output.toString("UTF-8");
                JSONObject response = new JSONObject(body);
                if (response.optJSONObject("meta") != null
                    && "warming"
                        .equals(response.optJSONObject("meta").optString("scheduleCacheStatus")))
                  throw new IllegalStateException("Warming");
                // Do not replace a newly selected route while the network request was running.
                if (active == params && original.equals(prefs.getString("widget", "{}"))) {
                  snapshot.put("trains", response.getJSONArray("trains"));
                  snapshot.put("date", date);
                  snapshot.put("fetchedAt", System.currentTimeMillis());
                  prefs.edit().putString("widget", snapshot.toString()).apply();
                }
              } catch (Exception error) {
                retry = true;
              } finally {
                if (connection != null) connection.disconnect();
              }
              if (active == params) {
                TrainWidget.updateAll(this);
                jobFinished(params, retry);
              }
            });
    return true;
  }

  @Override
  public boolean onStopJob(JobParameters params) {
    if (active == params) active = null;
    if (work != null) work.cancel(true);
    return true;
  }

  @Override
  public void onDestroy() {
    executor.shutdownNow();
    super.onDestroy();
  }
}
