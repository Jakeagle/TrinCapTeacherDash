/**
 * ==========================================
 * Lesson Management Module (LMM)
 * Lesson Management Listeners
 * ==========================================
 *
 * Purpose:
 * Centralized event listeners and handlers for the lesson management modal.
 * This module handles all lesson management operations including:
 * - Opening and populating the lesson management modal
 * - Replacing lessons in units
 * - Saving unit changes
 * - Copying default units to teacher's own units
 * - Assigning units to class periods
 * - Refreshing lesson data
 *
 * Dependencies:
 * - Global variables: window.teacherUnits, window.allTeacherLessons, window.activeTeacherName
 * - Global functions: loadTeacherLessons, populateMasterLessonSelect, openGlobalDialog, showNotification
 * - Socket: lessonSocket for real-time updates
 */

// Import lesson swaps functionality
import {
  performLessonRemoval,
  handleLessonReplaceWorkflow,
} from "./lessonSwaps.js";

// Import lesson data handler functionality
import {
  initializeRefreshDataListener,
  getLessonManagementHeaderHTML,
  refreshLessonManagementModal,
} from "./LessonDataHandler.js";

// Import lesson management core functionality
import { saveLessonData, assignUnitToClass } from "./lessonManagement.js";

// Track pending lesson changes per unit
if (!window.pendingLessonChanges) {
  window.pendingLessonChanges = new Map(); // unitValue -> { originalLessons: [], pendingLessons: [] }
}

/**
 * Initialize lesson management modal listeners
 * Call this once when the page loads
 */
export function initializeLessonManagementListeners() {
  console.log("[LMM] Initializing lesson management listeners...");

  // Lesson Management Button - Opens the modal
  const lessonManagementBtn = document.getElementById("lessonManagementBtn");
  if (lessonManagementBtn) {
    lessonManagementBtn.addEventListener(
      "click",
      handleLessonManagementBtnClick,
    );
    console.log("[LMM] Lesson management button listener attached");
  } else {
    console.warn("[LMM] Lesson management button not found");
  }
}

/**
 * Cleanup lesson management listeners
 * Call this when needed (e.g., page unload)
 */
export function cleanupLessonManagementListeners() {
  const lessonManagementBtn = document.getElementById("lessonManagementBtn");
  if (lessonManagementBtn) {
    lessonManagementBtn.removeEventListener(
      "click",
      handleLessonManagementBtnClick,
    );
  }

  // Cleanup any modal event listeners
  const dialogContent = document.getElementById("dialogContent");
  if (dialogContent) {
    dialogContent.removeEventListener(
      "click",
      handleLessonManagementDialogClick,
    );
  }

  console.log("[LMM] Lesson management listeners cleaned up");
}

/**
 * Handle lesson management button click - Opens the modal
 */
function handleLessonManagementBtnClick() {
  console.log("[LMM] Opening lesson management modal");

  const content = getModalHTML();

  window.openGlobalDialog("Lesson Management", "");
  document.getElementById("dialogContent").innerHTML = content;

  // Initialize pending changes tracking
  if (!window.pendingLessonChanges) {
    window.pendingLessonChanges = new Map();
  } else {
    // Clear any existing pending changes when opening the modal fresh
    window.pendingLessonChanges.clear();
  }

  // Join the lesson management room for real-time updates
  if (window.activeTeacherName && window.lessonSocket) {
    console.log(
      "[LMM] Joining lesson management room for:",
      window.activeTeacherName,
    );
    window.lessonSocket.emit("joinLessonManagement", window.activeTeacherName);
  }

  // Always refresh teacher data when opening lesson management modal
  console.log(
    "[LMM] Loading/refreshing teacher data for lesson management modal",
  );
  window
    .loadTeacherLessons(window.activeTeacherName)
    .then(() => {
      console.log(
        "[LMM] Teacher data loaded/refreshed for lesson management modal",
      );
      console.log("Current teacherUnits:", window.teacherUnits);
      console.log("Current contentType:", window.contentType);

      // After data is loaded, populate the modal
      populateAssignedUnits();
      window.populateMasterLessonSelect();
      populateUnitSelectorForAssignment();
    })
    .catch((error) => {
      console.error(
        "[LMM] Error loading teacher data for lesson management:",
        error,
      );
      // Fallback to existing data if available
      if (window.teacherUnits && window.allTeacherLessons) {
        populateAssignedUnits();
        window.populateMasterLessonSelect();
        populateUnitSelectorForAssignment();
      }
    });

  // Attach modal-specific event listeners
  attachModalEventListeners();
}

/**
 * Get the HTML content for the lesson management modal
 */
function getModalHTML() {
  return `
    <style>
      /* Master teacher content styling */
      .lesson-list-management li[data-is-master="true"] {
        background: linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, rgba(255, 215, 0, 0.05) 100%);
        border-left: 3px solid #ffd700;
        padding-left: 12px;
      }
      
      .lesson-list-management li[data-is-master="false"] {
        background: linear-gradient(135deg, rgba(144, 238, 144, 0.1) 0%, rgba(144, 238, 144, 0.05) 100%);
        border-left: 3px solid #90EE90;
        padding-left: 12px;
      }
      
      .master-content-header {
        animation: fadeInSlide 0.5s ease-out;
      }
      
      @keyframes fadeInSlide {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      
      /* Enhanced optgroup styling */
      select optgroup {
        font-weight: bold;
        font-style: normal;
        color: #333;
      }
      
      select optgroup[label*="Master"] {
        background-color: #fff9e6;
      }
      
      select optgroup[label*="Your"] {
        background-color: #f0fff0;
      }
    </style>
    
    ${getLessonManagementHeaderHTML()}
    
    <div class="lesson-management-container">
      
      <!-- Left Panel: Displays assigned units and their lessons -->
      <div class="assigned-units-view">
        <h5>Currently Assigned Units</h5>
        <div id="assignedUnitsContainer">
          <!-- Units will be populated dynamically -->
        </div>
      </div>

      <!-- Right Panel: Tools for managing lessons -->
      <div class="lesson-tools">
        <h5>Lesson Tools</h5>
        
        <div class="form-group">
          <label for="masterLessonSelect">All Available Lessons</label>
          <select id="masterLessonSelect" class="dialog-input" style="margin-top: 0.5em;"></select>
          <small style="font-size: 0.8em; color: rgba(255,255,255,0.7); margin-top: 0.5em;">
            📚 = Default lessons from master teacher<br>
            📝 = Your own lessons<br>
            To replace a lesson, select one from this list, then click "Replace" on a lesson to the left.
          </small>
        </div>
        
        <hr />
        
        <h5>Assign Unit to Class</h5>
        <form id="assignUnitForm">
          <div class="form-group" style="margin-top: 1em;">
            <label for="unitSelectForAssignment">Select Unit:</label>
            <select id="unitSelectForAssignment" class="dialog-input" style="width: 100%; margin-top: 0.5em;"></select>
          </div>
          <div class="form-group" style="margin-top: 1em;">
            <label for="classPeriodSelect">Select Class Period:</label>
            <select id="classPeriodSelect" class="dialog-input" style="width: 100%; margin-top: 0.5em;">
              <option value="01">Period 1</option>
              <option value="02">Period 2</option>
              <option value="03">Period 3</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary" style="margin-top: 1.5em; width: 100%;">Assign Unit</button>
        </form>
      </div>
    </div>
  `;
}

/**
 * Attach event listeners to modal elements
 * Called after modal HTML is inserted
 */
function attachModalEventListeners() {
  console.log("[LMM] Attaching modal event listeners");

  // Remove any existing event listeners before adding new ones to prevent duplicates
  const dialogContent = document.getElementById("dialogContent");
  if (dialogContent) {
    dialogContent.removeEventListener(
      "click",
      handleLessonManagementDialogClick,
    );
    dialogContent.addEventListener("click", handleLessonManagementDialogClick);
  }

  // Initialize refresh data listener from LDH module
  initializeRefreshDataListener();

  // Assign unit form event handler
  const assignUnitForm = document.getElementById("assignUnitForm");
  if (assignUnitForm) {
    assignUnitForm.addEventListener("submit", handleAssignUnitSubmit);
  }
}

/**
 * Global event handler function for lesson management modal clicks
 * Handles: remove lesson, replace lesson, save unit, copy unit buttons
 */
function handleLessonManagementDialogClick(e) {
  if (e.target.classList.contains("remove-lesson-btn")) {
    handleRemoveLessonClick(e.target);
  } else if (e.target.classList.contains("replace-lesson-btn")) {
    handleLessonReplace(e.target);
  } else if (e.target.classList.contains("save-unit-btn")) {
    handleSaveUnit(e.target);
  } else if (e.target.classList.contains("copy-unit-btn")) {
    handleCopyDefaultUnit(e.target);
  }
}

/**
 * Handle remove lesson button click
 */
function handleRemoveLessonClick(removeButton) {
  console.log("[LMM] Remove lesson initiated");

  const success = performLessonRemoval(removeButton);

  if (success) {
    console.log("[LMM] Lesson removal completed successfully via LSM module");
  }
}

/**
 * Handle lesson replacement
 */
function handleLessonReplace(replaceButton) {
  console.log("[LMM] Delegating lesson replacement to LSM module");

  const success = handleLessonReplaceWorkflow(replaceButton);

  if (!success) {
    console.error("[LMM] Lesson replacement failed");
  }
}

/**
 * Handle save unit button click
 */
async function handleSaveUnit(saveButton) {
  console.log("[LMM] === HANDLE SAVE UNIT START ===");
  console.log("Save button clicked:", saveButton);
  console.log("window.teacherUnits:", window.teacherUnits);
  console.log("window.allTeacherLessons:", window.allTeacherLessons);
  console.log("window.activeTeacherName:", window.activeTeacherName);

  const unitCard = saveButton.closest(".assigned-unit-card");
  if (!unitCard) {
    console.error("[LMM] Could not find assigned-unit-card ancestor");
    alert("Unable to find unit information. Please try again.");
    return;
  }

  const unitValue = unitCard.getAttribute("data-unit-value");
  console.log("[LMM] Unit card found:", unitCard);
  console.log("[LMM] Unit value from data attribute:", unitValue);

  if (!unitValue) {
    console.error("[LMM] Unit card HTML:", unitCard.outerHTML);
    alert("Unable to find unit identifier. Please try again.");
    return;
  }

  // Find the complete unit data from window.teacherUnits
  const currentUnit = window.teacherUnits.find((u) => u.value === unitValue);
  if (!currentUnit) {
    console.error(
      "[LMM] Could not find unit in teacherUnits array. Available units:",
      window.teacherUnits,
    );
    console.error("[LMM] Looking for unit value:", unitValue);
    alert("Unable to find unit data. Please refresh and try again.");
    return;
  }

  console.log("[LMM] Found current unit:", currentUnit);

  // Determine lessons to save - use pending changes if they exist, otherwise use current unit lessons
  let lessonsToSave = [];

  if (
    window.pendingLessonChanges &&
    window.pendingLessonChanges.has(unitValue)
  ) {
    // Use pending changes - PRESERVE COMPLETE LESSON OBJECTS
    const pendingData = window.pendingLessonChanges.get(unitValue);
    lessonsToSave = pendingData.pendingLessons.map((lesson) => ({
      ...lesson, // Keep ALL lesson data including _id, content, etc.
    }));
    console.log("[LMM] Using pending changes for lessons:", lessonsToSave);
  } else {
    // No pending changes - extract lessons from the DOM as fallback
    const lessonItems = unitCard.querySelectorAll(
      ".lesson-list-management li[data-lesson-id]",
    );

    lessonItems.forEach((lessonItem) => {
      const lessonId = lessonItem.getAttribute("data-lesson-id");
      const lessonText = lessonItem.querySelector("span")?.textContent;

      // Only process items that have a valid lesson ID and are not placeholder text
      if (
        lessonId &&
        lessonId.trim() !== "" &&
        lessonText &&
        lessonText !== "No lessons in this unit yet." &&
        !lessonText.includes("No lessons in this unit yet")
      ) {
        // Find the full lesson data from allTeacherLessons
        const fullLesson = window.allTeacherLessons.find(
          (l) => l._id === lessonId,
        );
        if (fullLesson) {
          lessonsToSave.push({
            ...fullLesson, // Keep ALL lesson data including _id, content, etc.
          });
        } else {
          console.warn(
            "[LMM] Could not find full lesson data for lesson ID:",
            lessonId,
          );
        }
      }
    });
    console.log(
      "[LMM] No pending changes - extracted lessons from DOM:",
      lessonsToSave,
    );
  }

  // Create the complete unit data object with updated lessons
  const unitData = {
    value: currentUnit.value,
    name: currentUnit.name,
    lessons: lessonsToSave,
    isDefaultUnit: currentUnit.isDefaultUnit,
    assigned_to_period: currentUnit.assigned_to_period,
  };

  console.log("[LMM] Saving unit:", unitValue);
  console.log("[LMM] Complete unit data to save:", unitData);

  try {
    const originalText = saveButton.textContent;
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    // Use the modular save function from lessonManagement.js
    const saveData = {
      teacherName: window.activeTeacherName,
      unitData: unitData,
    };

    await saveLessonData(saveData);

    // Handle UI feedback for successful save
    handleSuccessfulSave(saveButton, unitCard, unitValue, originalText);
  } catch (error) {
    console.error("[LMM] Error saving unit changes:", error);

    // Handle specific error types
    if (error.message && error.message.includes("default unit")) {
      window.showNotification(
        "You cannot modify default units. Please create your own unit and lessons instead.",
        "error",
        8000,
      );
    } else {
      window.showNotification(
        `Error: ${error.message || "Failed to save unit changes"}`,
        "error",
      );
    }
  } finally {
    saveButton.disabled = false;
    if (saveButton.textContent === "Saving...") {
      saveButton.textContent = `Save Changes to ${unitValue}`;
    }
  }
}

/**
 * Handle UI feedback for successful save operations
 * @param {HTMLElement} saveButton - The save button element
 * @param {HTMLElement} unitCard - The unit card element
 * @param {string} unitValue - The unit value
 * @param {string} originalText - Original button text
 */
function handleSuccessfulSave(saveButton, unitCard, unitValue, originalText) {
  // Remove visual indicators of unsaved changes
  const changedLessons = unitCard.querySelectorAll("li[data-changed='true']");
  changedLessons.forEach((lessonItem) => {
    lessonItem.removeAttribute("data-changed");
    lessonItem.style.backgroundColor = "";
    lessonItem.style.border = "";
  });

  // Visual feedback - briefly change button color
  saveButton.style.backgroundColor = "#28a745";
  saveButton.style.animation = "";
  saveButton.textContent = "Saved!";

  setTimeout(() => {
    saveButton.style.backgroundColor = "";
    saveButton.textContent = originalText;
  }, 2000);
}

/**
 * Handle copy default unit button click
 */
async function handleCopyDefaultUnit(copyButton) {
  console.log("[LMM] === HANDLE COPY DEFAULT UNIT START ===");

  const unitCard = copyButton.closest(".assigned-unit-card");
  if (!unitCard) {
    console.error("[LMM] Could not find assigned-unit-card ancestor");
    alert("Unable to find unit information. Please try again.");
    return;
  }

  const unitValue = unitCard.getAttribute("data-unit-value");
  if (!unitValue) {
    console.error("[LMM] Unit value not found in data-unit-value attribute");
    alert("Unable to identify unit. Please refresh and try again.");
    return;
  }

  // Confirm with the user
  const unitTitle = unitCard
    .querySelector("h6")
    .textContent.replace(" (Default unit)", "");
  const confirmMessage = `Copy "${unitTitle}" to your own units?\n\nThis will create your own editable copy of this default unit with all its lessons. You'll then be able to modify it as needed.`;

  if (!confirm(confirmMessage)) {
    return;
  }

  try {
    // Disable button during operation
    const originalText = copyButton.textContent;
    copyButton.disabled = true;
    copyButton.textContent = "📋 Copying...";

    const response = await fetch(
      `${window.LESSON_SERVER_URL}/copy-default-unit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teacherName: window.activeTeacherName,
          unitValue: unitValue,
        }),
      },
    );

    const result = await response.json();

    if (response.ok && result.success) {
      window.showNotification(`✅ ${result.message}`, "success", 8000);

      // Reload the teacher's lesson data to show the new unit
      await window.loadTeacherLessons(window.activeTeacherName);

      // Refresh the modal display
      refreshLessonManagementModal();

      console.log("[LMM] Default unit copied successfully:", result);
    } else {
      if (response.status === 409) {
        window.showNotification(
          "You already have a unit with this identifier. Please modify your existing unit instead.",
          "error",
          6000,
        );
      } else {
        window.showNotification(
          `Error: ${result.message || "Failed to copy unit"}`,
          "error",
          6000,
        );
      }
    }
  } catch (error) {
    console.error("[LMM] Error copying default unit:", error);
    window.showNotification(
      "An error occurred while copying the unit. Please try again.",
      "error",
      5000,
    );
  } finally {
    copyButton.disabled = false;
    copyButton.textContent = originalText;
  }
}

/**
 * Handle refresh lesson data button click
 */
function handleRefreshLessonData(e) {
  console.log("[LMM] Manual refresh requested by user");

  const refreshBtn = e.target;

  // Show loading indication
  refreshBtn.textContent = "🔄 Refreshing...";
  refreshBtn.disabled = true;

  // Use loadTeacherLessons to ensure proper default unit handling
  window
    .loadTeacherLessons(window.activeTeacherName)
    .then(() => {
      console.log(
        "[LMM] Manual refresh completed - reloading lesson management modal",
      );
      window.showNotification("Lesson data refreshed successfully", "success");

      // Refresh the modal display with updated data
      refreshLessonManagementModal();
    })
    .catch((error) => {
      console.error("[LMM] Error refreshing lesson data:", error);
      window.showNotification("Error refreshing lesson data", "error");
    })
    .finally(() => {
      // Reset button
      refreshBtn.textContent = "🔄 Refresh Data";
      refreshBtn.disabled = false;
    });
}

/**
 * Handle assign unit form submission
 */
async function handleAssignUnitSubmit(e) {
  e.preventDefault(); // Prevent form from submitting normally

  console.log("[LMM] 🎯 Unit assignment initiated");

  // Get form values from the dropdowns
  const unitSelect = document.getElementById("unitSelectForAssignment");
  const periodSelect = document.getElementById("classPeriodSelect");

  const selectedUnitValue = unitSelect?.value;
  const selectedPeriod = periodSelect?.value;

  console.log("[LMM] Form values:", {
    selectedUnitValue,
    selectedPeriod,
    teacherName: window.activeTeacherName,
  });

  // Validate form inputs
  if (!selectedUnitValue || !selectedPeriod) {
    window.showNotification(
      "Please select both a unit and a class period.",
      "error",
    );
    return;
  }

  if (!window.activeTeacherName) {
    window.showNotification(
      "No active teacher found. Please refresh and try again.",
      "error",
    );
    return;
  }

  // Find the selected unit details to verify it exists
  const selectedUnit = window.teacherUnits?.find(
    (unit) => unit.value === selectedUnitValue,
  );
  if (!selectedUnit) {
    window.showNotification(
      "Selected unit not found. Please refresh and try again.",
      "error",
    );
    return;
  }

  console.log("[LMM] Selected unit details:", {
    unitName: selectedUnit.name,
    lessonCount: selectedUnit.lessons?.length || 0,
    hasLessons: !!selectedUnit.lessons,
    lessons: selectedUnit.lessons,
  });

  // Additional validation for unit lessons
  if (
    !selectedUnit.lessons ||
    !Array.isArray(selectedUnit.lessons) ||
    selectedUnit.lessons.length === 0
  ) {
    window.showNotification(
      `Unit "${selectedUnit.name}" has no lessons to assign. Please add lessons to this unit first.`,
      "error",
    );
    return;
  }

  try {
    // Prepare assignment data - pass the COMPLETE unit object
    const assignmentData = {
      teacherName: window.activeTeacherName,
      unitValue: selectedUnitValue,
      classPeriod: selectedPeriod,
      unitObject: selectedUnit, // Pass the complete unit with lessons
    };

    console.log("[LMM] 📦 Assignment data prepared:", assignmentData);
    console.log(
      "[LMM] 🔍 Unit object lessons:",
      selectedUnit.lessons.length,
      "lessons",
    );
    console.log(
      "[LMM] 🔍 Sample lesson IDs:",
      selectedUnit.lessons.map((l) => l._id),
    );

    // Call the assignment function from the lesson management module
    const result = await assignUnitToClass(assignmentData);

    if (result && result.success) {
      console.log("[LMM] ✅ Assignment completed successfully");

      // Clear the form selections
      unitSelect.value = "";
      periodSelect.value = "";

      // The success notification is handled by the assignment function
      console.log("[LMM] Form cleared, assignment process complete");
    }
  } catch (error) {
    console.error("[LMM] ❌ Assignment failed:", error);
    window.showNotification(
      `Assignment failed: ${error.message || "Unknown error occurred"}`,
      "error",
    );
  }
}

/**
 * Populate assigned units in the modal
 * Internal function used by the modal
 */
function populateAssignedUnits() {
  const container = document.getElementById("assignedUnitsContainer");
  if (container) {
    window.populateAssignedUnitsDisplay(container);
  }
}

/**
 * Populate unit selector for assignment
 * Internal function used by the modal
 */
function populateUnitSelectorForAssignment() {
  const unitSelector = document.getElementById("unitSelectForAssignment");
  if (unitSelector) {
    window.populateUnitSelectorForAssignmentDisplay(unitSelector);
  }
}

/**
 * Export functions to window object for global access
 */
window.handleLessonManagementDialogClick = handleLessonManagementDialogClick;

console.log("[LMM] Lesson Management Listeners module loaded");
