/**
 * Sample Teacher Reset Helper - Teacher Dashboard
 * ===============================================
 * Handles sample teacher data cleanup when logging out or leaving the page
 *
 * Automatically detects if user is a sample user and triggers data reset
 */

class SampleTeacherResetHelper {
  constructor(apiBaseUrl = "http://localhost:3000") {
    this.apiBaseUrl = apiBaseUrl;
    this.resetInProgress = false;
  }

  /**
   * Checks if a username is a sample user
   */
  isSampleUser(username) {
    return username && username.toLowerCase().includes("sample");
  }

  /**
   * Resets sample teacher data when they log out or leave
   * Should be called during logout and unload events
   */
  async resetSampleTeacherDataIfNeeded(username) {
    if (!this.isSampleUser(username) || this.resetInProgress) {
      return { skipped: true, reason: "not_sample_user" };
    }

    this.resetInProgress = true;

    try {
      console.log(
        `🗑️  [SampleTeacherResetHelper] Resetting sample teacher data for: ${username}`,
      );

      const response = await fetch(`${this.apiBaseUrl}/sample/reset-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username,
          userType: "teacher",
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log(
          `✅ [SampleTeacherResetHelper] Sample data reset successful:`,
          result,
        );
        return { success: true, result };
      } else {
        console.warn(
          `⚠️  [SampleTeacherResetHelper] Server returned error:`,
          response.status,
        );
        return { success: false, reason: "server_error" };
      }
    } catch (error) {
      console.error(
        `❌ [SampleTeacherResetHelper] Error resetting sample data:`,
        error,
      );
      return { success: false, reason: "fetch_error", error: error.message };
    } finally {
      this.resetInProgress = false;
    }
  }

  /**
   * Reset using sendBeacon (for unload events)
   * This is more reliable during page unload
   */
  resetSampleTeacherWithBeacon(username) {
    if (!this.isSampleUser(username)) {
      return false;
    }

    try {
      const payload = JSON.stringify({
        username: username,
        userType: "teacher",
      });

      const sent = navigator.sendBeacon(
        `${this.apiBaseUrl}/sample/reset-data`,
        new Blob([payload], { type: "application/json" }),
      );

      if (sent) {
        console.log(
          `📡 [SampleTeacherResetHelper] Sent reset request via sendBeacon for: ${username}`,
        );
      }
      return sent;
    } catch (error) {
      console.error(
        `❌ [SampleTeacherResetHelper] Error with sendBeacon:`,
        error,
      );
      return false;
    }
  }

  /**
   * Setup handlers for logout and page unload
   * Call this during app initialization
   */
  setupResetHandlers(getCurrentUsername) {
    // Handle logout - look for logout button or sign-on dialog close
    const signOnDialog = document.getElementById("signOnDialog");
    if (signOnDialog) {
      signOnDialog.addEventListener("close", (e) => {
        const username = getCurrentUsername();
        if (this.isSampleUser(username)) {
          console.log(
            `[SampleTeacherResetHelper] Sign-on dialog closed for sample user: ${username}`,
          );
          // Will be reset on page unload
        }
      });
    }

    // Handle page unload/refresh/close
    window.addEventListener("beforeunload", (e) => {
      const username = getCurrentUsername();
      if (this.isSampleUser(username)) {
        console.log(
          `[SampleTeacherResetHelper] Page unload detected for sample user: ${username}`,
        );
        this.resetSampleTeacherWithBeacon(username);
      }
    });

    // Handle visibility change (tab/window blur)
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        const username = getCurrentUsername();
        if (this.isSampleUser(username)) {
          console.log(
            `[SampleTeacherResetHelper] Page hidden for sample user: ${username}`,
          );
          // Reset data when user leaves the page
          this.resetSampleTeacherWithBeacon(username);
        }
      }
    });

    console.log("✅ [SampleTeacherResetHelper] Reset handlers initialized");
  }
}

// Export for use in script.js
if (typeof window !== "undefined") {
  window.SampleTeacherResetHelper = SampleTeacherResetHelper;
}
