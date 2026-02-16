/**
 * Lesson Data Handler Module (LDH)
 * Handles refresh data functionality for the lesson management modal
 * Part of the Lesson Management Module (LMM) system
 */

/**
 * Handle refresh lesson data button click
 * @param {Event} e - The click event from the refresh button
 */
function handleRefreshLessonData(e) {
  console.log("[LDH] Manual refresh requested by user");

  const refreshBtn = e.target;

  // Show loading indication
  refreshBtn.textContent = "🔄 Refreshing...";
  refreshBtn.disabled = true;

  // Use loadTeacherLessons to ensure proper default unit handling
  window
    .loadTeacherLessons(window.activeTeacherName)
    .then(() => {
      console.log(
        "[LDH] Manual refresh completed - reloading lesson management modal",
      );
      window.showNotification("Lesson data refreshed successfully", "success");

      // Refresh the modal display with updated data
      refreshLessonManagementModal();
    })
    .catch((error) => {
      console.error("[LDH] Error refreshing lesson data:", error);
      window.showNotification("Error refreshing lesson data", "error");
    })
    .finally(() => {
      // Reset button
      refreshBtn.textContent = "🔄 Refresh Data";
      refreshBtn.disabled = false;
    });
}

/**
 * Refresh the lesson management modal display with updated data
 */
function refreshLessonManagementModal() {
  const globalDialog = document.getElementById("globalDialog");
  const dialogTitle = document.getElementById("dialogTitle");

  // Only refresh if the lesson management modal is currently open
  if (
    globalDialog &&
    globalDialog.open &&
    dialogTitle &&
    dialogTitle.textContent === "Lesson Management"
  ) {
    console.log("[LDH] Refreshing lesson management modal display");
    console.log("Current teacherUnits data:", window.teacherUnits);
    console.log("Current allTeacherLessons data:", window.allTeacherLessons);

    // Clear pending changes when refreshing
    if (window.pendingLessonChanges) {
      window.pendingLessonChanges.clear();
      console.log("[LDH] Cleared all pending lesson changes on refresh");
    }

    // Call the internal populateAssignedUnits function
    const container = document.getElementById("assignedUnitsContainer");
    if (container) {
      console.log("[LDH] Refreshing assignedUnitsContainer");
      window.populateAssignedUnitsDisplay(container);
    } else {
      console.error("[LDH] assignedUnitsContainer not found");
    }

    // Also refresh the dropdowns
    window.populateMasterLessonSelect();

    // Check if the unit selector exists and refresh it
    const unitSelector = document.getElementById("unitSelectForAssignment");
    if (unitSelector) {
      window.populateUnitSelectorForAssignmentDisplay(unitSelector);
    }
  } else {
    console.log("[LDH] Lesson management modal is not open, skipping refresh");
  }
}

/**
 * Initialize refresh button event listener
 */
function initializeRefreshDataListener() {
  const refreshBtn = document.getElementById("refreshLessonDataBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", handleRefreshLessonData);
    console.log("[LDH] Refresh data button listener attached");
  } else {
    console.warn("[LDH] Refresh data button not found");
  }
}

/**
 * Get the HTML for the refresh data button
 * @returns {string} HTML string for the refresh button
 */
function getRefreshButtonHTML() {
  return `<button id="refreshLessonDataBtn" class="btn btn-secondary" style="background: #6c757d; color: white; border: none; padding: 0.5em 1em; border-radius: 4px; cursor: pointer;">
        🔄 Refresh Data
      </button>`;
}

/**
 * Get the header HTML with refresh button
 * @returns {string} HTML string for the modal header with refresh button
 */
function getLessonManagementHeaderHTML() {
  return `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1em;">
      <h4 style="margin: 0;">Lesson Management</h4>
      ${getRefreshButtonHTML()}
    </div>`;
}

// Export functions for use by other modules
window.LessonDataHandler = {
  handleRefreshLessonData,
  refreshLessonManagementModal,
  initializeRefreshDataListener,
  getRefreshButtonHTML,
  getLessonManagementHeaderHTML,
};
// Also expose refreshLessonManagementModal directly on window for backward compatibility
window.refreshLessonManagementModal = refreshLessonManagementModal;
// Also export individual functions for direct import
export {
  handleRefreshLessonData,
  refreshLessonManagementModal,
  initializeRefreshDataListener,
  getRefreshButtonHTML,
  getLessonManagementHeaderHTML,
};

console.log("[LDH] Lesson Data Handler module loaded");
