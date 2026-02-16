/**
 * Lesson Swaps Module (LSM)
 * Handles removing and replacing of lessons in the module
 * Part of the Lesson Management Module (LMM) system
 */

/**
 * Validates that a lesson is selected from the master lesson dropdown
 * @param {HTMLSelectElement} masterLessonSelect - The master lesson dropdown element
 * @returns {boolean} - Returns true if valid selection, false otherwise
 */
function validateLessonSelection(masterLessonSelect) {
  if (!masterLessonSelect || !masterLessonSelect.value) {
    alert(
      "Please select a lesson from the 'All Available Lessons' dropdown first.",
    );
    return false;
  }
  return true;
}

/**
 * Validates that all required elements are present for lesson replacement
 * @param {Object} elements - Object containing required DOM elements
 * @returns {boolean} - Returns true if all elements are valid, false otherwise
 */
function validateReplacementElements(elements) {
  const { lessonItem, unitCard, lessonSpan } = elements;

  if (!lessonItem) {
    console.error("[LSM] Lesson item element is missing");
    return false;
  }

  if (!unitCard) {
    console.error("[LSM] Unit card element is missing");
    return false;
  }

  if (!lessonSpan) {
    console.error("[LSM] Lesson span element is missing");
    return false;
  }

  return true;
}

/**
 * Finds the selected lesson data from the available teacher lessons
 * @param {string} selectedLessonId - The ID of the selected lesson
 * @returns {Object|null} - Returns the lesson object if found, null otherwise
 */
function findSelectedLessonData(selectedLessonId) {
  if (!window.allTeacherLessons || !selectedLessonId) {
    console.warn("[LSM] Missing allTeacherLessons or selectedLessonId", {
      hasAllTeacherLessons: !!window.allTeacherLessons,
      selectedLessonId: selectedLessonId,
      allTeacherLessonsLength: window.allTeacherLessons
        ? window.allTeacherLessons.length
        : 0,
    });
    return null;
  }

  // Convert selectedLessonId to number since DB stores _id as number
  const selectedLessonIdNum = Number(selectedLessonId);

  console.log("[LSM] Searching for lesson with ID:", {
    originalId: selectedLessonId,
    originalType: typeof selectedLessonId,
    numericId: selectedLessonIdNum,
    numericType: typeof selectedLessonIdNum,
    isValidNumber: !isNaN(selectedLessonIdNum),
  });

  // Try numeric ID match first (most likely for _id field)
  let selectedLesson = window.allTeacherLessons.find(
    (l) => l._id === selectedLessonIdNum,
  );

  // If not found, try string ID match as fallback
  if (!selectedLesson) {
    selectedLesson = window.allTeacherLessons.find(
      (l) => l._id === selectedLessonId,
    );
  }

  // If not found, try matching by lesson_id field (numeric)
  if (!selectedLesson) {
    selectedLesson = window.allTeacherLessons.find(
      (l) => l.lesson_id === selectedLessonIdNum,
    );
  }

  // If not found, try matching by lesson_id field (string)
  if (!selectedLesson) {
    selectedLesson = window.allTeacherLessons.find(
      (l) => l.lesson_id === selectedLessonId,
    );
  }

  // If still not found, try matching by id field (numeric)
  if (!selectedLesson) {
    selectedLesson = window.allTeacherLessons.find(
      (l) => l.id === selectedLessonIdNum,
    );
  }

  // If still not found, try matching by id field (string)
  if (!selectedLesson) {
    selectedLesson = window.allTeacherLessons.find(
      (l) => l.id === selectedLessonId,
    );
  }

  // If still not found, log debug info and show detailed error
  if (!selectedLesson) {
    console.error("[LSM] Could not find lesson with ID:", {
      searchedStringId: selectedLessonId,
      searchedNumericId: selectedLessonIdNum,
    });
    console.error(
      "[LSM] Available lesson IDs:",
      window.allTeacherLessons.map((l) => ({
        _id: l._id,
        _idType: typeof l._id,
        lesson_id: l.lesson_id,
        lesson_idType: typeof l.lesson_id,
        id: l.id,
        idType: typeof l.id,
        lesson_title: l.lesson_title,
      })),
    );
    alert(
      `Could not find the selected lesson data. Lesson ID: ${selectedLessonId} (string) / ${selectedLessonIdNum} (number). Please check the lesson database connection.`,
    );
    return null;
  }

  console.log("[LSM] Found selected lesson:", selectedLesson);
  return selectedLesson;
}

/**
 * Initializes pending changes tracking for a unit if it doesn't exist
 * @param {string} unitValue - The unit value identifier
 */
function initializePendingChanges(unitValue) {
  if (!window.pendingLessonChanges) {
    window.pendingLessonChanges = new Map();
  }

  if (!window.pendingLessonChanges.has(unitValue)) {
    const unit = window.teacherUnits.find((u) => u.value === unitValue);
    if (unit && unit.lessons) {
      window.pendingLessonChanges.set(unitValue, {
        originalLessons: JSON.parse(JSON.stringify(unit.lessons)), // Deep copy of original state
        pendingLessons: JSON.parse(JSON.stringify(unit.lessons)), // Deep copy for modifications
      });
    }
  }
}

/**
 * Updates the pending changes tracking with the new lesson
 * @param {string} unitValue - The unit value identifier
 * @param {number} lessonIndex - The index of the lesson being replaced
 * @param {Object} selectedLesson - The new lesson data
 */
function updatePendingChanges(unitValue, lessonIndex, selectedLesson) {
  const pendingData = window.pendingLessonChanges.get(unitValue);

  if (pendingData && lessonIndex >= 0) {
    // CRITICAL: Preserve the COMPLETE lesson object, don't strip any data
    // This ensures the lesson maintains all properties needed for proper functionality
    pendingData.pendingLessons[lessonIndex] = {
      ...selectedLesson, // Keep ALL original lesson data
      order: lessonIndex, // Update position for sorting
    };

    console.log(
      "[LSM] Updated lesson at index",
      lessonIndex,
      "in pending changes with complete lesson data. ID:",
      selectedLesson._id,
    );
  }
}

/**
 * Updates the DOM to reflect the lesson replacement
 * @param {Object} elements - Object containing DOM elements to update
 * @param {Object} selectedLesson - The new lesson data
 */
function updateLessonDOM(elements, selectedLesson) {
  const { lessonSpan, lessonItem } = elements;

  // Update the lesson display text
  lessonSpan.textContent = `Lesson: ${selectedLesson.lesson_title}`;

  // Ensure lesson has a valid _id - use different ID fields as fallback
  const lessonId =
    selectedLesson._id || selectedLesson.lesson_id || selectedLesson.id;

  if (!lessonId) {
    console.error(
      "[LSM] Warning: No valid ID found for lesson:",
      selectedLesson,
    );
  }

  // Update lesson item attributes with the best available ID
  lessonItem.setAttribute("data-lesson-id", lessonId || "unknown");
  lessonItem.setAttribute("data-changed", "true");

  // Add visual indication of change
  lessonItem.style.backgroundColor = "rgba(255, 193, 7, 0.2)";
  lessonItem.style.border = "1px solid rgba(255, 193, 7, 0.5)";

  console.log("[LSM] Updated DOM with lesson ID:", lessonId);
}

/**
 * Updates the save button to show unsaved changes
 * @param {HTMLElement} unitCard - The unit card containing the save button
 */
function updateSaveButtonIndicator(unitCard) {
  const saveButton = unitCard.querySelector(".save-unit-btn");

  if (saveButton && !saveButton.disabled) {
    saveButton.style.backgroundColor = "#ff6b35";
    saveButton.textContent = "Save Changes (Unsaved)";
    saveButton.style.animation = "pulse 1s infinite";
  }
}

/**
 * Validates that all required elements are present for lesson removal
 * @param {Object} elements - Object containing required DOM elements for removal
 * @returns {boolean} - Returns true if all elements are valid, false otherwise
 */
function validateRemovalElements(elements) {
  const { lessonItem, unitCard } = elements;

  if (!lessonItem) {
    console.error("[LSM] Lesson item element is missing for removal");
    return false;
  }

  if (!unitCard) {
    console.error("[LSM] Unit card element is missing for removal");
    return false;
  }

  return true;
}

/**
 * Removes a lesson from the pending changes tracking
 * @param {string} unitValue - The unit value identifier
 * @param {number} lessonIndex - The index of the lesson being removed
 */
function removeLessonFromPendingChanges(unitValue, lessonIndex) {
  const pendingData = window.pendingLessonChanges.get(unitValue);

  if (pendingData && lessonIndex >= 0) {
    pendingData.pendingLessons.splice(lessonIndex, 1);
    console.log(
      `[LSM] Removed lesson at index ${lessonIndex} from pending changes`,
    );
  }
}

/**
 * Removes a lesson item from the DOM
 * @param {HTMLElement} lessonItem - The lesson item to remove
 */
function removeLessonFromDOM(lessonItem) {
  lessonItem.remove();
  console.log("[LSM] Lesson item removed from view");
}

/**
 * Performs the complete lesson removal workflow
 * @param {HTMLElement} removeButton - The remove button that was clicked
 * @returns {boolean} - Returns true if removal was successful, false otherwise
 */
function performLessonRemoval(removeButton) {
  const lessonItem = removeButton.closest("li");
  const unitCard = lessonItem.closest(".assigned-unit-card");
  const unitValue = unitCard.getAttribute("data-unit-value");

  // Validate required elements
  if (!validateRemovalElements({ lessonItem, unitCard })) {
    return false;
  }

  if (!unitValue) {
    console.error("[LSM] Unit value is missing for lesson removal");
    return false;
  }

  // Initialize pending changes for this unit
  initializePendingChanges(unitValue);

  // Get the lesson position in the DOM
  const lessonItems = unitCard.querySelectorAll("li[data-lesson-id]");
  const lessonIndex = Array.from(lessonItems).indexOf(lessonItem);

  // Update pending changes tracking
  removeLessonFromPendingChanges(unitValue, lessonIndex);

  // Remove from DOM
  removeLessonFromDOM(lessonItem);

  // Show visual indicator that there are unsaved changes
  updateSaveButtonIndicator(unitCard);

  console.log("[LSM] Lesson removal completed successfully");
  return true;
}

/**
 * Handles the lesson replacement workflow with proper element gathering
 * @param {HTMLElement} replaceButton - The replace button that was clicked
 * @returns {boolean} - Returns true if replacement was successful, false otherwise
 */
function handleLessonReplaceWorkflow(replaceButton) {
  const masterLessonSelect = document.getElementById("masterLessonSelect");
  const lessonItem = replaceButton.closest("li");
  const lessonSpan = lessonItem.querySelector("span");
  const unitCard = lessonItem.closest(".assigned-unit-card");
  const unitValue = unitCard.getAttribute("data-unit-value");

  // Debug logging
  console.log("[LSM] Replace lesson initiated for unit:", unitValue);
  console.log(
    "[LSM] Master lesson select value:",
    masterLessonSelect ? masterLessonSelect.value : "not found",
  );
  console.log("[LSM] Lesson item:", lessonItem);
  console.log("[LSM] Unit card:", unitCard);

  // Use the modular lesson swaps functionality
  const replacementData = {
    masterLessonSelect,
    lessonItem,
    unitCard,
    lessonSpan,
    unitValue,
  };

  const success = performLessonReplacement(replacementData);

  if (success) {
    console.log(
      "[LSM] Lesson replacement completed successfully via LSM module",
    );
  }

  return success;
}

/**
 * Performs the complete lesson replacement workflow
 * @param {Object} replacementData - Object containing all necessary data for replacement
 * @returns {boolean} - Returns true if replacement was successful, false otherwise
 */
function performLessonReplacement(replacementData) {
  const { masterLessonSelect, lessonItem, unitCard, lessonSpan, unitValue } =
    replacementData;

  // Validate lesson selection
  if (!validateLessonSelection(masterLessonSelect)) {
    return false;
  }

  // Validate required elements
  if (!validateReplacementElements({ lessonItem, unitCard, lessonSpan })) {
    return false;
  }

  const selectedLessonId = masterLessonSelect.value;

  // Confirm replacement with user
  const confirmReplace = confirm(
    `Are you sure you want to replace this lesson with the selected one?`,
  );

  if (!confirmReplace) {
    return false;
  }

  // Find the selected lesson data
  const selectedLesson = findSelectedLessonData(selectedLessonId);
  if (!selectedLesson) {
    return false;
  }

  // Initialize pending changes for this unit
  initializePendingChanges(unitValue);

  // Get the lesson position in the DOM
  const lessonItems = unitCard.querySelectorAll("li[data-lesson-id]");
  const lessonIndex = Array.from(lessonItems).indexOf(lessonItem);

  // Update pending changes tracking
  updatePendingChanges(unitValue, lessonIndex, selectedLesson);

  // Update the DOM
  updateLessonDOM({ lessonSpan, lessonItem }, selectedLesson);

  // Show visual indicator that there are unsaved changes
  updateSaveButtonIndicator(unitCard);

  console.log("[LSM] Lesson replacement completed successfully");
  return true;
}

// Export functions for use by other modules
window.LessonSwaps = {
  validateLessonSelection,
  validateReplacementElements,
  validateRemovalElements,
  findSelectedLessonData,
  initializePendingChanges,
  updatePendingChanges,
  removeLessonFromPendingChanges,
  updateLessonDOM,
  removeLessonFromDOM,
  updateSaveButtonIndicator,
  handleLessonReplaceWorkflow,
  performLessonReplacement,
  performLessonRemoval,
};

// Also export individual functions for direct import
export {
  validateLessonSelection,
  validateReplacementElements,
  validateRemovalElements,
  findSelectedLessonData,
  initializePendingChanges,
  updatePendingChanges,
  removeLessonFromPendingChanges,
  updateLessonDOM,
  removeLessonFromDOM,
  updateSaveButtonIndicator,
  handleLessonReplaceWorkflow,
  performLessonReplacement,
  performLessonRemoval,
};
