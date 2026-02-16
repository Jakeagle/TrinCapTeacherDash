/**
 * ============================================================================
 * SAVE LESSON MODULE
 * ============================================================================
 *
 * Purpose: Handles the creation and saving of lessons to MongoDB
 *
 * Responsibilities:
 * - Collect lesson data from event listeners
 * - Validate lesson information
 * - Save lesson to Lessons collection with full content
 * - Update teacher's units array with lesson reference
 * - Generate unique numeric IDs for lessons
 *
 * MongoDB Schema:
 * Lessons Collection: {
 *   _id: numeric timestamp,
 *   teacher: "teacher@email.com",
 *   unit: { value: "unit1", name: "Unit 1: Name" },
 *   lesson_title: "Lesson Title",
 *   lesson_description: "Description",
 *   content: [{ type, content }],
 *   lesson_blocks: [{ type, content }],
 *   intro_text_blocks: [{ type, content }],
 *   learning_objectives: [],
 *   lesson_conditions: [],
 *   required_actions: [],
 *   success_metrics: {},
 *   teks_standards: [],
 *   createdAt: Date
 * }
 *
 * Teachers Collection Update:
 * units[].lessons[] = {
 *   _id: "numeric_id_as_string",
 *   lesson_title: "Lesson Title",
 *   lesson_description: "Description"
 * }
 *
 * @module SaveLesson
 */

// API Configuration
const API_CONFIG = {
  lessonServer: "http://localhost:4000",
  mainServer: "http://localhost:3000",
};

// ============================================================================
// STATE & VALIDATION
// ============================================================================

let lessonCreationState = {
  isSaving: false,
  lastSavedLesson: null,
  errors: [],
};

/**
 * Gets the current lesson creation state
 * @returns {Object} Current state
 */
export function getLessonCreationState() {
  return { ...lessonCreationState };
}

/**
 * Resets the lesson creation state
 */
export function resetLessonCreationState() {
  lessonCreationState = {
    isSaving: false,
    lastSavedLesson: null,
    errors: [],
  };
  console.log("[LCM-SaveLesson] State reset");
}

// ============================================================================
// ID GENERATION
// ============================================================================

/**
 * Generates a unique numeric ID for a lesson (timestamp-based)
 * @returns {number} Unique numeric ID
 */
function generateLessonId() {
  return Date.now();
}

// ============================================================================
// DATA PREPARATION
// ============================================================================

/**
 * Prepares the complete lesson document for Lessons collection
 * @param {Object} lessonData - Raw lesson data from listeners
 * @returns {Object} MongoDB-ready lesson document
 */
export function prepareLessonDocument(lessonData) {
  console.log("[LCM-SaveLesson] Preparing lesson document for MongoDB");

  // Generate unique numeric ID
  const lessonId = generateLessonId();

  // Prepare unit object
  const unitObj = {
    value: lessonData.unitValue || lessonData.unit,
    name: lessonData.unitName || "",
  };

  // Prepare the complete lesson document
  const lessonDocument = {
    _id: lessonId,
    teacher: lessonData.teacher || window.activeTeacherName,
    unit: unitObj,
    lesson_title: lessonData.lesson_title || "",
    lesson_description: lessonData.lesson_description || "",

    // Content arrays
    content: lessonData.content || lessonData.lesson_blocks || [],
    lesson_blocks: lessonData.lesson_blocks || lessonData.content || [],
    intro_text_blocks: lessonData.intro_text_blocks || [],
    learning_objectives: lessonData.learning_objectives || [],

    // Conditions and actions
    lesson_conditions: lessonData.lesson_conditions || [],
    required_actions: lessonData.required_actions || [],
    success_metrics: lessonData.success_metrics || {},

    // Standards and metadata
    teks_standards: lessonData.teks_standards || [],
    day: lessonData.day || null,
    status: lessonData.status || "active",
    difficulty_level:
      lessonData.difficulty_level || lessonData.difficulty || null,
    estimated_duration:
      lessonData.estimated_duration || lessonData.estimated_time || null,
    dallas_fed_aligned: lessonData.dallas_fed_aligned || null,
    condition_alignment: lessonData.condition_alignment || null,
    structure_cleaned: lessonData.structure_cleaned || null,

    // Timestamps
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  console.log("[LCM-SaveLesson] Lesson document prepared:", {
    _id: lessonDocument._id,
    teacher: lessonDocument.teacher,
    title: lessonDocument.lesson_title,
    unit: lessonDocument.unit,
    contentBlocks: lessonDocument.content.length,
    introBlocks: lessonDocument.intro_text_blocks.length,
    objectives: lessonDocument.learning_objectives.length,
  });

  return lessonDocument;
}

/**
 * Prepares the lesson reference for teacher's units array
 * @param {Object} lessonDocument - Complete lesson document
 * @returns {Object} Lesson reference for units array
 */
export function prepareLessonReference(lessonDocument) {
  return {
    _id: lessonDocument._id.toString(), // Convert numeric ID to string
    lesson_title: lessonDocument.lesson_title,
    lesson_description: lessonDocument.lesson_description,
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates lesson data before saving
 * @param {Object} lessonData - Lesson data to validate
 * @returns {Object} { isValid: boolean, errors: Array }
 */
export function validateLessonData(lessonData) {
  console.log("[LCM-SaveLesson] Validating lesson data");

  const errors = [];

  // Validate lesson title
  if (!lessonData.lesson_title || lessonData.lesson_title.trim() === "") {
    errors.push({
      field: "lesson_title",
      message: "Lesson title is required",
    });
  } else if (lessonData.lesson_title.length < 3) {
    errors.push({
      field: "lesson_title",
      message: "Lesson title must be at least 3 characters",
    });
  }

  // Validate lesson description
  if (
    !lessonData.lesson_description ||
    lessonData.lesson_description.trim() === ""
  ) {
    errors.push({
      field: "lesson_description",
      message: "Lesson description is required",
    });
  }

  // Validate unit assignment
  if (!lessonData.unitValue && !lessonData.unit) {
    errors.push({
      field: "unit",
      message: "Please select a unit for this lesson",
    });
  }

  // Validate teacher
  if (!lessonData.teacher && !window.activeTeacherName) {
    errors.push({
      field: "teacher",
      message: "Teacher information is missing. Please sign in again.",
    });
  }

  // Validate content
  const contentBlocks = lessonData.content || lessonData.lesson_blocks || [];
  if (contentBlocks.length === 0) {
    errors.push({
      field: "content",
      message: "Lesson must have at least one content block",
    });
  }

  const isValid = errors.length === 0;

  lessonCreationState.errors = errors;

  console.log(
    "[LCM-SaveLesson] Validation result:",
    isValid ? "PASSED" : "FAILED",
  );
  if (!isValid) {
    console.log("[LCM-SaveLesson] Validation errors:", errors);
  }

  return { isValid, errors };
}

// ============================================================================
// SAVE TO SERVER
// ============================================================================

/**
 * Saves the lesson to the server (MongoDB)
 * @param {Object} lessonData - Raw lesson data from listeners
 * @returns {Promise<Object>} Result object { success, message, lesson, lessonId }
 */
export async function saveLesson(lessonData) {
  console.log("[LCM-SaveLesson] Starting save operation");

  // Validate first
  const validation = validateLessonData(lessonData);
  if (!validation.isValid) {
    console.error("[LCM-SaveLesson] Validation failed, aborting save");
    return {
      success: false,
      message: "Validation failed",
      errors: validation.errors,
    };
  }

  // Check if already saving
  if (lessonCreationState.isSaving) {
    console.warn("[LCM-SaveLesson] Save already in progress");
    return {
      success: false,
      message: "Save already in progress",
    };
  }

  lessonCreationState.isSaving = true;

  try {
    // Prepare the lesson document
    const lessonDocument = prepareLessonDocument(lessonData);

    // Prepare the lesson reference for units array
    const lessonReference = prepareLessonReference(lessonDocument);

    // Prepare request body
    const requestBody = {
      lesson: lessonDocument,
      lessonReference: lessonReference,
    };

    console.log("[LCM-SaveLesson] Sending request to server");

    // Send to server
    const response = await fetch(
      `${API_CONFIG.lessonServer}/api/lessons/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.message || `Server responded with ${response.status}`,
      );
    }

    const result = await response.json();

    if (result.success) {
      console.log("[LCM-SaveLesson] ✅ Lesson saved successfully:", result);

      lessonCreationState.lastSavedLesson = lessonDocument;

      // Dispatch success event
      window.dispatchEvent(
        new CustomEvent("lcm:lessonSaved", {
          detail: {
            lesson: lessonDocument,
            lessonId: lessonDocument._id,
            teacherName: lessonDocument.teacher,
            unitValue: lessonDocument.unit.value,
            timestamp: Date.now(),
          },
        }),
      );

      return {
        success: true,
        message: `Lesson "${lessonDocument.lesson_title}" saved successfully`,
        lesson: result.lesson || lessonDocument,
        lessonId: lessonDocument._id,
      };
    } else {
      throw new Error(result.message || "Failed to save lesson");
    }
  } catch (error) {
    console.error("[LCM-SaveLesson] ❌ Error saving lesson:", error);

    // Dispatch error event
    window.dispatchEvent(
      new CustomEvent("lcm:lessonSaveError", {
        detail: {
          error: error.message,
          lessonData,
          timestamp: Date.now(),
        },
      }),
    );

    return {
      success: false,
      message: error.message || "Failed to save lesson",
    };
  } finally {
    lessonCreationState.isSaving = false;
  }
}

/**
 * Handles the save lesson button click
 * This integrates with lessonCreationListeners.js
 */
export async function handleSaveLessonClick() {
  console.log("[LCM-SaveLesson] Save lesson button clicked");

  // Show loading state
  if (window.showLoadingSpinner) {
    window.showLoadingSpinner(
      "Saving lesson...",
      "Creating lesson in database",
    );
  }

  try {
    // Import and use the collectLessonData function from lessonCreationListeners
    // This should be available in the global scope or imported
    let lessonData;

    if (typeof window.collectLessonData === "function") {
      lessonData = window.collectLessonData();
    } else {
      throw new Error(
        "Lesson data collection function not available. Please ensure lessonCreationListeners.js is loaded.",
      );
    }

    console.log("[LCM-SaveLesson] Collected lesson data:", lessonData);

    // Save to server
    const result = await saveLesson(lessonData);

    if (result.success) {
      // Show success notification
      if (window.showNotification) {
        window.showNotification(`✅ ${result.message}`, "success", 5000);
      } else {
        alert(result.message);
      }

      // Reload teacher lessons to reflect new lesson
      if (window.loadTeacherLessons && lessonData.teacher) {
        console.log("[LCM-SaveLesson] Reloading teacher lessons");
        await window.loadTeacherLessons(
          lessonData.teacher || window.activeTeacherName,
        );
      }

      // Refresh unit selector and lesson lists
      if (window.populateUnitSelector) {
        console.log("[LCM-SaveLesson] Refreshing unit selector dropdown");
        window.populateUnitSelector();
      }

      // Close the lesson creation modal if requested
      if (lessonData.closeAfterSave) {
        if (window.closeGlobalDialog) {
          window.closeGlobalDialog();
        }
      }

      // Clear the lesson form or reset state
      if (window.resetLessonCreationState) {
        window.resetLessonCreationState();
      }

      return result;
    } else {
      // Show error notification
      const errorMsg = result.errors
        ? result.errors.map((e) => e.message).join("\n")
        : result.message;

      if (window.showNotification) {
        window.showNotification(
          `❌ Failed to save lesson: ${errorMsg}`,
          "error",
          7000,
        );
      } else {
        alert(`Failed to save lesson:\n${errorMsg}`);
      }

      // Display validation errors in UI
      if (result.errors && window.displayLessonValidationErrors) {
        window.displayLessonValidationErrors(result.errors);
      }

      return result;
    }
  } catch (error) {
    console.error("[LCM-SaveLesson] Unexpected error:", error);

    if (window.showNotification) {
      window.showNotification(
        `❌ Unexpected error: ${error.message}`,
        "error",
        7000,
      );
    } else {
      alert(`Unexpected error: ${error.message}`);
    }

    return {
      success: false,
      message: error.message,
    };
  } finally {
    // Hide loading state
    if (window.hideLoadingSpinner) {
      window.hideLoadingSpinner();
    }
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initializes the save lesson button listener
 * Call this when the lesson creation modal is displayed
 */
export function initializeSaveLessonListener() {
  console.log("[LCM-SaveLesson] Initializing save lesson listener");

  const saveLessonBtn = document.getElementById("saveLessonBtn");
  if (saveLessonBtn) {
    // Remove existing listener if any
    saveLessonBtn.removeEventListener("click", handleSaveLessonClick);

    // Add listener
    saveLessonBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      await handleSaveLessonClick();
    });

    console.log("[LCM-SaveLesson] Save lesson button listener attached");
  } else {
    console.warn(
      "[LCM-SaveLesson] Save lesson button not found (ID: saveLessonBtn)",
    );
  }
}

/**
 * Cleans up save lesson listeners
 */
export function cleanupSaveLessonListener() {
  console.log("[LCM-SaveLesson] Cleaning up save lesson listener");

  const saveLessonBtn = document.getElementById("saveLessonBtn");
  if (saveLessonBtn) {
    saveLessonBtn.removeEventListener("click", handleSaveLessonClick);
  }

  resetLessonCreationState();
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Checks if a lesson with the same title exists in the same unit
 * @param {string} teacherName - Teacher name
 * @param {string} unitValue - Unit value (e.g., "unit1")
 * @param {string} lessonTitle - Lesson title
 * @returns {Promise<boolean>} True if lesson exists, false otherwise
 */
export async function checkLessonExists(teacherName, unitValue, lessonTitle) {
  try {
    const response = await fetch(
      `${API_CONFIG.lessonServer}/api/lessons/check?teacherName=${encodeURIComponent(teacherName)}&unitValue=${encodeURIComponent(unitValue)}&lessonTitle=${encodeURIComponent(lessonTitle)}`,
    );

    if (!response.ok) {
      throw new Error("Failed to check existing lessons");
    }

    const data = await response.json();

    return data.exists || false;
  } catch (error) {
    console.error("[LCM-SaveLesson] Error checking lesson existence:", error);
    return false;
  }
}

/**
 * Suggests a lesson number based on existing lessons in the unit
 * @param {string} teacherName - Teacher name
 * @param {string} unitValue - Unit value
 * @returns {Promise<number>} Next available lesson number
 */
export async function suggestNextLessonNumber(teacherName, unitValue) {
  try {
    const response = await fetch(
      `${API_CONFIG.lessonServer}/api/lessons/count?teacherName=${encodeURIComponent(teacherName)}&unitValue=${encodeURIComponent(unitValue)}`,
    );

    if (!response.ok) {
      return 1; // Default to lesson 1
    }

    const data = await response.json();

    return (data.count || 0) + 1;
  } catch (error) {
    console.error("[LCM-SaveLesson] Error suggesting lesson number:", error);
    return 1;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  saveLesson,
  handleSaveLessonClick,
  initializeSaveLessonListener,
  cleanupSaveLessonListener,
  validateLessonData,
  prepareLessonDocument,
  prepareLessonReference,
  generateLessonId,
  checkLessonExists,
  suggestNextLessonNumber,
  getLessonCreationState,
  resetLessonCreationState,
};
