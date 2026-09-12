package dev.hsichen.ontrack;

import static org.junit.Assert.*;

import org.junit.Test;

public class AppConfigurationTest {

    @Test
    public void applicationIdMatchesPlayListing() {
        assertEquals("dev.hsichen.ontrack", BuildConfig.APPLICATION_ID);
    }
}
