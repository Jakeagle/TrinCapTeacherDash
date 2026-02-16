/**
 * Lesson Management Module (LMM)
 * Lesson Management Core
 * ==========================================
 *
 * Purpose:
 * Core lesson management functionality including saving lesson data,
 * managing lesson persistence, and coordinating lesson data operations.
 * This module handles the core business logic for lesson management operations.
 *
 * Dependencies:
 * - Global variables: window.teacherUnits, window.allTeacherLessons, window.activeTeacherName
 * - Global functions: showNotification, loadTeacherLessons
 * - API endpoints: /saveUnitChanges, /copy-default-unit, /assign-unit
 * - Socket: lessonSocket for real-time updates
 */

/**
 * Save lesson data for a specific unit
 * @param {Object} saveData - The data to save
 * @returns {Promise} - Promise that resolves when save is complete
 */
async function saveLessonData(saveData) {
  console.log("[LMC] Saving lesson data:", saveData);

  const { teacherName, unitData } = saveData;

  // Validate the save data
  const validation = validateLessonData(saveData);
  if (!validation.isValid) {
    throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
  }

  // Prepare data for saving
  const preparedData = prepareLessonDataForSave(saveData);

  console.log("[LMC] === SENDING REQUEST TO SERVER ===");
  console.log(
    "[LMC] Request URL:",
    `${window.LESSON_SERVER_URL}/saveUnitChanges`,
  );
  console.log("[LMC] Request payload:", JSON.stringify(preparedData, null, 2));

  try {
    const response = await fetch(
      `${window.LESSON_SERVER_URL}/saveUnitChanges`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(preparedData),
      },
    );

    const result = await response.json();

    if (response.ok && result.success) {
      console.log("[LMC] Save successful:", result);
      handleSaveCompletion({
        success: true,
        unitData,
        result,
      });
      return result;
    } else {
      console.error("[LMC] Save failed:", result);
      throw new Error(result.message || "Failed to save unit changes");
    }
  } catch (error) {
    console.error("[LMC] Error during save:", error);
    throw error;
  }
}

/**
 * Validate lesson data before saving
 * @param {Object} lessonData - The lesson data to validate
 * @returns {Object} - Validation result with success/error information
 */
function validateLessonData(lessonData) {
  console.log("[LMC] Validating lesson data:", lessonData);

  const errors = [];

  // Validate required fields
  if (!lessonData.teacherName) {
    errors.push("Teacher name is required");
  }

  if (!lessonData.unitData) {
    errors.push("Unit data is required");
  }

  if (lessonData.unitData) {
    if (!lessonData.unitData.value) {
      errors.push("Unit value is required");
    }
    if (!lessonData.unitData.name) {
      errors.push("Unit name is required");
    }
    if (!Array.isArray(lessonData.unitData.lessons)) {
      errors.push("Unit lessons must be an array");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Prepare lesson data for saving
 * @param {Object} rawData - Raw lesson data from the UI
 * @returns {Object} - Formatted data ready for saving
 */
function prepareLessonDataForSave(rawData) {
  console.log("[LMC] Preparing lesson data for save:", rawData);

  const { teacherName, unitData } = rawData;

  // CRITICAL: Preserve ALL lesson data, don't strip any fields
  // The server needs complete lesson objects to maintain data integrity
  const formattedLessons = unitData.lessons.map((lesson, index) => ({
    ...lesson, // Keep ALL original lesson data
    order: index, // Update the order position
  }));

  // Format data to match server endpoint expectations
  // Server expects: { teacherName, unitValue, lessons }
  const preparedData = {
    teacherName,
    unitValue: unitData.value, // Server expects 'unitValue', not nested 'unitData.value'
    lessons: formattedLessons, // Server expects 'lessons' at top level with complete data
  };

  console.log("[LMC] Prepared data for save:", preparedData);
  return preparedData;
}

/**
 * Handle save completion and cleanup
 * @param {Object} saveResult - Result from the save operation
 */
function handleSaveCompletion(saveResult) {
  console.log("[LMC] Save completed:", saveResult);

  const { success, unitData, result } = saveResult;

  if (success) {
    // Update local teacher units data
    updateLocalTeacherUnits(unitData);

    // Clear pending changes for this unit
    clearPendingChanges(unitData.value);

    // Show success notification
    window.showNotification(
      `Unit "${unitData.name}" changes saved successfully!`,
      "success",
    );

    console.log("[LMC] Save completion handled successfully");
  } else {
    console.error("[LMC] Save completion called with failure");
  }
}

/**
 * Update local teacher units data after successful save
 * @param {Object} unitData - The unit data that was saved
 */
function updateLocalTeacherUnits(unitData) {
  if (window.teacherUnits && Array.isArray(window.teacherUnits)) {
    const unit = window.teacherUnits.find((u) => u.value === unitData.value);
    if (unit) {
      unit.lessons = unitData.lessons;
      console.log("[LMC] Updated local teacher units for:", unitData.value);
    }
  }
}

/**
 * Clear pending changes for a specific unit
 * @param {string} unitValue - The unit value to clear changes for
 */
function clearPendingChanges(unitValue) {
  if (
    window.pendingLessonChanges &&
    window.pendingLessonChanges.has(unitValue)
  ) {
    window.pendingLessonChanges.delete(unitValue);
    console.log("[LMC] Cleared pending changes for unit:", unitValue);
  }
}

/**
 * Assign unit to class period
 * @param {Object} assignmentData - The assignment data
 * @returns {Promise} - Promise that resolves when assignment is complete
 */
async function assignUnitToClass(assignmentData) {
  console.log("[LMC] Assigning unit to class:", assignmentData);

  const { teacherName, unitValue, classPeriod, unitObject } = assignmentData;

  // Validate the assignment data
  const validation = validateAssignmentData(assignmentData);
  if (!validation.isValid) {
    throw new Error(
      `Assignment validation failed: ${validation.errors.join(", ")}`,
    );
  }

  // Use the passed unit object OR find it if not passed (fallback)
  let unitToAssign = unitObject;
  if (!unitToAssign) {
    console.log("[LMC] No unit object passed, searching for unit:", unitValue);
    unitToAssign = window.teacherUnits?.find(
      (unit) => unit.value === unitValue,
    );
  } else {
    console.log("[LMC] Using passed unit object:", unitToAssign.name);
  }

  if (!unitToAssign) {
    throw new Error(`Unit not found: ${unitValue}`);
  }

  // Validate that the unit has lessons
  console.log("[LMC] Found unit to assign:", {
    unitName: unitToAssign.name,
    unitValue: unitToAssign.value,
    lessonsCount: unitToAssign.lessons?.length || 0,
    hasLessons: !!unitToAssign.lessons,
  });

  if (
    !unitToAssign.lessons ||
    !Array.isArray(unitToAssign.lessons) ||
    unitToAssign.lessons.length === 0
  ) {
    throw new Error(
      `Unit "${unitToAssign.name}" has no lessons to assign. Please add lessons to this unit first.`,
    );
  }

  // Prepare assignment data for the server
  console.log(
    "[LMC] About to prepare assignment data with unit:",
    unitToAssign,
  );
  console.log("[LMC] Unit has lessons:", !!unitToAssign.lessons);
  console.log("[LMC] Lessons count:", unitToAssign.lessons?.length);

  const preparedAssignmentData = prepareUnitAssignmentData({
    teacherName,
    unitToAssign,
    classPeriod,
  });

  console.log("[LMC] === PREPARED ASSIGNMENT DATA ===");
  console.log("[LMC] Prepared data:", preparedAssignmentData);
  console.log(
    "[LMC] Lesson IDs in prepared data:",
    preparedAssignmentData.lessonIds,
  );
  console.log(
    "[LMC] Lesson IDs count:",
    preparedAssignmentData.lessonIds?.length,
  );

  console.log("[LMC] === SENDING ASSIGNMENT REQUEST TO SERVER ===");
  console.log("[LMC] Request URL:", `${window.LESSON_SERVER_URL}/assign-unit`);
  console.log(
    "[LMC] Request payload:",
    JSON.stringify(preparedAssignmentData, null, 2),
  );

  try {
    const response = await fetch(`${window.LESSON_SERVER_URL}/assign-unit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preparedAssignmentData),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      console.log("[LMC] Assignment successful:", result);
      handleAssignmentCompletion({
        success: true,
        assignmentData,
        result,
      });
      return result;
    } else {
      console.error("[LMC] Assignment failed:", result);
      throw new Error(result.message || "Failed to assign unit");
    }
  } catch (error) {
    console.error("[LMC] Error during assignment:", error);
    throw error;
  }
}

/**
 * Validate assignment data before processing
 * @param {Object} assignmentData - The assignment data to validate
 * @returns {Object} - Validation result with success/error information
 */
function validateAssignmentData(assignmentData) {
  console.log("[LMC] Validating assignment data:", assignmentData);

  const errors = [];

  // Validate required fields
  if (!assignmentData.teacherName) {
    errors.push("Teacher name is required");
  }

  if (!assignmentData.unitValue) {
    errors.push("Unit value is required");
  }

  if (!assignmentData.classPeriod) {
    errors.push("Class period is required");
  }

  // Validate class period format (should be a number string)
  if (
    assignmentData.classPeriod &&
    isNaN(parseInt(assignmentData.classPeriod, 10))
  ) {
    errors.push("Class period must be a valid number");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Prepare unit assignment data for server
 * @param {Object} rawAssignmentData - Raw assignment data from UI
 * @returns {Object} - Formatted data ready for server processing
 */
function prepareUnitAssignmentData({ teacherName, unitToAssign, classPeriod }) {
  console.log("[LMC] ===== PREPARE ASSIGNMENT DATA START =====");
  console.log("[LMC] Input parameters:", { teacherName, classPeriod });
  console.log("[LMC] Unit to assign:", unitToAssign);
  console.log("[LMC] Unit name:", unitToAssign?.name);
  console.log("[LMC] Unit lessons property exists:", !!unitToAssign?.lessons);
  console.log(
    "[LMC] Unit lessons is array:",
    Array.isArray(unitToAssign?.lessons),
  );
  console.log("[LMC] Unit lessons count:", unitToAssign?.lessons?.length || 0);

  // DEBUG: Log the full unit structure to understand the data
  console.log(
    "[LMC] Full unit structure:",
    JSON.stringify(unitToAssign, null, 2),
  );
  console.log("[LMC] Unit lessons property:", unitToAssign.lessons);
  console.log("[LMC] Lessons array length:", unitToAssign.lessons?.length || 0);

  // Extract lesson IDs from the unit
  // CRITICAL: Get the lesson IDs as numbers, not strings, as per schema requirement
  let lessonIds = [];

  if (unitToAssign.lessons && Array.isArray(unitToAssign.lessons)) {
    console.log("[LMC] Processing lessons array...");

    lessonIds = unitToAssign.lessons
      .map((lesson, index) => {
        console.log(`[LMC] Lesson ${index}:`, lesson);

        // Try different possible lesson ID fields
        let lessonId =
          lesson._id || lesson.id || lesson.lessonId || lesson.lesson_id;

        console.log(
          `[LMC] Extracted lesson ID for lesson ${index}:`,
          lessonId,
          typeof lessonId,
        );

        if (!lessonId) {
          console.warn(
            `[LMC] No valid lesson ID found for lesson ${index}:`,
            lesson,
          );
          return null;
        }

        // Convert lesson._id to number if it's a string representation of a number
        if (typeof lessonId === "string" && !isNaN(parseInt(lessonId, 10))) {
          return parseInt(lessonId, 10);
        }
        // If it's already a number, return as is
        if (typeof lessonId === "number") {
          return lessonId;
        }
        // If it's an ObjectId string, we might need to handle this differently
        // For now, we'll store the string but log a warning
        console.warn(
          "[LMC] Lesson ID is not a number:",
          lessonId,
          typeof lessonId,
        );
        return lessonId;
      })
      .filter((id) => id !== null); // Remove null values
  } else {
    console.error(
      "[LMC] Unit has no lessons array or lessons is not an array:",
      {
        lessonsProperty: unitToAssign.lessons,
        unitKeys: Object.keys(unitToAssign || {}),
      },
    );
  }

  console.log("[LMC] Extracted lesson IDs:", lessonIds);
  console.log("[LMC] Total lesson IDs extracted:", lessonIds.length);

  // Validate that we have lesson IDs
  if (lessonIds.length === 0) {
    console.error("[LMC] No lesson IDs extracted from unit:", unitToAssign);
    throw new Error(
      "No lesson IDs found in the selected unit. Please ensure the unit has lessons.",
    );
  }

  // Format assignment data to match server expectations and schema requirements
  const assignmentData = {
    teacherName,
    unitValue: unitToAssign.value,
    unitName: unitToAssign.name,
    classPeriod: parseInt(classPeriod, 10), // Convert to number
    lessonIds, // Array of lesson IDs as numbers
    assignmentType: "objectId-based", // As per schema
  };

  console.log("[LMC] Prepared assignment data:", assignmentData);
  return assignmentData;
}

/**
 * Handle assignment completion and cleanup
 * @param {Object} assignmentResult - Result from the assignment operation
 */
function handleAssignmentCompletion(assignmentResult) {
  console.log("[LMC] Assignment completed:", assignmentResult);

  const { success, assignmentData, result } = assignmentResult;

  if (success) {
    // Show success notification
    window.showNotification(
      `Unit "${assignmentData.unitValue}" successfully assigned to Period ${assignmentData.classPeriod}!`,
      "success",
    );

    // Refresh lesson data to show updated assignments
    if (
      window.loadTeacherLessons &&
      typeof window.loadTeacherLessons === "function"
    ) {
      window.loadTeacherLessons(assignmentData.teacherName);
    }

    console.log("[LMC] Assignment completion handled successfully");
    console.log("[LMC] Students affected:", result.studentsAffected || 0);
  } else {
    console.error("[LMC] Assignment completion called with failure");
  }
}

/**
 * Initialize lesson management core functionality
 */
function initializeLessonManagement() {
  console.log("[LMC] Initializing lesson management core");

  // TODO: Initialize core lesson management functionality
}

// Export functions for use by other modules
window.LessonManagement = {
  saveLessonData,
  validateLessonData,
  prepareLessonDataForSave,
  handleSaveCompletion,
  updateLocalTeacherUnits,
  clearPendingChanges,
  assignUnitToClass,
  validateAssignmentData,
  prepareUnitAssignmentData,
  handleAssignmentCompletion,
  initializeLessonManagement,
};

// Also export individual functions for direct import
export {
  saveLessonData,
  validateLessonData,
  prepareLessonDataForSave,
  handleSaveCompletion,
  updateLocalTeacherUnits,
  clearPendingChanges,
  assignUnitToClass,
  validateAssignmentData,
  prepareUnitAssignmentData,
  handleAssignmentCompletion,
  initializeLessonManagement,
};

console.log("[LMC] Lesson Management Core module loaded");
