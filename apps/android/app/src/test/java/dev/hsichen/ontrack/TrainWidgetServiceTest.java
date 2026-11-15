package dev.hsichen.ontrack;

import static org.junit.Assert.*;

import org.junit.Test;

public class TrainWidgetServiceTest {
  @Test
  public void onlyConfirmedJourneySuspensionsAreExcluded() {
    for (String value : new String[] {"full", "origin-stop", "destination-stop"})
      assertTrue(TrainWidget.hasConfirmedSuspension(value));
    for (String value : new String[] {null, "", "unknown", "partial", "future-status"})
      assertFalse(TrainWidget.hasConfirmedSuspension(value));
  }
}
