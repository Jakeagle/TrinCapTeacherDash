/**
 * ============================================================================
 * SAVE UNIT MODULE
 * ============================================================================
 *
 * Purpose: Handles the creation and saving of units to MongoDB
 *
 * Responsibilities:
 * - Collect unit data from form inputs
 * - Validate unit information
 * - Prepare unit payload for MongoDB
 * - Save unit to Teachers collection
 * - Handle success/error responses
 *
 * MongoDB Schema:
 * Teachers.units = [{
 *   value: "unit1",
 *   name: "Unit 1: Unit Name",
 *   lessons: [], // Filled later when lessons are assigned
 *   isDefaultUnit: false, // true only for admin@trinity-capital.net
 *   assigned_to_period: "" // Empty until assigned
 * }]
 *
 * @module SaveUnit
 */

// API Configuration
const API_CONFIG = {
  lessonServer: "http://localhost:4000",
  mainServer: "http://localhost:3000",
};

// Admin account constant
const ADMIN_ACCOUNT = "admin@trinity-capital.net";

// ============================================================================
// STATE & VALIDATION
// ============================================================================

let unitCreationState = {
  isSaving: false,
  lastSavedUnit: null,
  errors: [],
};

/**
 * Gets the current unit creation state
 * @returns {Object} Current state
 */
export function getUnitCreationState() {
  return { ...unitCreationState };
}

/**
 * Resets the unit creation state
 */
export function resetUnitCreationState() {
  unitCreationState = {
    isSaving: false,
    lastSavedUnit: null,
    errors: [],
  };
  console.log("[LCM-SaveUnit] State reset");
}

// ============================================================================
// DATA COLLECTION
// ============================================================================

/**
 * Collects unit data from form inputs
 * @returns {Object} Unit data object
 */
export function collectUnitData() {
  console.log("[LCM-SaveUnit] Collecting unit data from form");

  // Get unit number input (using the actual HTML ID from lesson builder)
  const unitNumberInput = document.getElementById("newUnitNumber");
  const unitNumber = unitNumberInput?.value.trim() || "";

  // Get unit name input (using the actual HTML ID from lesson builder)
  const unitNameInput = document.getElementById("newUnitName");
  const unitName = unitNameInput?.value.trim() || "";

  // Get teacher info
  const teacherName = window.activeTeacherName || "";

  console.log("[LCM-SaveUnit] Collected data:", {
    unitNumber,
    unitName,
    teacherName,
  });

  return {
    unitNumber,
    unitName,
    teacherName,
  };
}

/**
 * Validates unit data before saving
 * @param {Object} unitData - Unit data to validate
 * @returns {Object} { isValid: boolean, errors: Array }
 */
export function validateUnitData(unitData) {
  console.log("[LCM-SaveUnit] Validating unit data");

  const errors = [];

  // Validate unit number
  if (!unitData.unitNumber) {
    errors.push({
      field: "newUnitNumber",
      message: "Unit number is required",
    });
  } else if (!/^\d+$/.test(unitData.unitNumber)) {
    errors.push({
      field: "newUnitNumber",
      message: "Unit number must be a valid number",
    });
  }

  // Validate unit name
  if (!unitData.unitName) {
    errors.push({
      field: "newUnitName",
      message: "Unit name is required",
    });
  } else if (unitData.unitName.length < 3) {
    errors.push({
      field: "newUnitName",
      message: "Unit name must be at least 3 characters",
    });
  } else if (unitData.unitName.length > 100) {
    errors.push({
      field: "newUnitName",
      message: "Unit name must be less than 100 characters",
    });
  }

  // Validate teacher
  if (!unitData.teacherName) {
    errors.push({
      field: "teacher",
      message: "Teacher information is missing. Please sign in again.",
    });
  }

  // Check for duplicate custom units in teacher's OWN units only (NOT admin defaults)
  const unitValue = `unit${unitData.unitNumber}`;
  // Use teacherOwnUnits which only contains the teacher's actual units from MongoDB
  if (window.teacherOwnUnits && Array.isArray(window.teacherOwnUnits)) {
    const existingCustomUnit = window.teacherOwnUnits.find(
      (unit) => unit.value === unitValue,
    );

    if (existingCustomUnit) {
      errors.push({
        field: "newUnitNumber",
        message: `You already have a custom unit with number ${unitData.unitNumber}. Please choose a different number.`,
      });
      console.log(
        "[LCM-SaveUnit] Duplicate found in teacherOwnUnits:",
        existingCustomUnit,
      );
    } else {
      console.log(
        `[LCM-SaveUnit] No duplicate found for ${unitValue} in teacher's own units`,
      );
    }
  } else {
    console.log(
      "[LCM-SaveUnit] teacherOwnUnits is empty or not initialized - allowing creation",
    );
  }

  const isValid = errors.length === 0;

  unitCreationState.errors = errors;

  console.log(
    "[LCM-SaveUnit] Validation result:",
    isValid ? "PASSED" : "FAILED",
  );
  if (!isValid) {
    console.log("[LCM-SaveUnit] Validation errors:", errors);
  }

  return { isValid, errors };
}

// ============================================================================
// UNIT PAYLOAD PREPARATION
// ============================================================================

/**
 * Prepares the unit object for MongoDB insertion
 * @param {Object} unitData - Raw unit data from form
 * @returns {Object} MongoDB-ready unit object
 */
export function prepareUnitPayload(unitData) {
  console.log("[LCM-SaveUnit] Preparing unit payload for MongoDB");

  const { unitNumber, unitName, teacherName } = unitData;

  // Create the value (e.g., "unit1")
  const value = `unit${unitNumber}`;

  // Create the full name (e.g., "Unit 1: Banking Basics")
  // Capitalize "Unit" and include the number
  const fullName = `Unit ${unitNumber}: ${unitName}`;

  // Determine if this is a default unit (created by admin)
  const isDefaultUnit = teacherName === ADMIN_ACCOUNT;

  // Create the unit object according to MongoDB schema
  const unitPayload = {
    value: value,
    name: fullName,
    lessons: [], // Empty array - will be populated when lessons are assigned
    isDefaultUnit: isDefaultUnit,
    assigned_to_period: "", // Empty until unit is assigned to a class period
  };

  console.log("[LCM-SaveUnit] Unit payload prepared:", unitPayload);

  return unitPayload;
}

// ============================================================================
// SAVE TO SERVER
// ============================================================================

/**
 * Saves the unit to the server (MongoDB)
 * @param {Object} unitData - Raw unit data from form
 * @returns {Promise<Object>} Result object { success, message, unit }
 */
export async function saveUnit(unitData) {
  console.log("[LCM-SaveUnit] Starting save operation");

  // Validate first
  const validation = validateUnitData(unitData);
  if (!validation.isValid) {
    console.error("[LCM-SaveUnit] Validation failed, aborting save");
    return {
      success: false,
      message: "Validation failed",
      errors: validation.errors,
    };
  }

  // Check if already saving
  if (unitCreationState.isSaving) {
    console.warn("[LCM-SaveUnit] Save already in progress");
    return {
      success: false,
      message: "Save already in progress",
    };
  }

  unitCreationState.isSaving = true;

  try {
    // Prepare the unit payload
    const unitPayload = prepareUnitPayload(unitData);

    // Prepare request body
    const requestBody = {
      teacherName: unitData.teacherName,
      unit: unitPayload,
    };

    console.log("[LCM-SaveUnit] Sending request to server:", requestBody);

    // Send to server
    const response = await fetch(
      `${API_CONFIG.lessonServer}/api/units/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Server responded with ${response.status}: ${response.statusText}`,
      );
    }

    const result = await response.json();

    if (result.success) {
      console.log("[LCM-SaveUnit] ✅ Unit saved successfully:", result);

      unitCreationState.lastSavedUnit = unitPayload;

      // Dispatch success event
      window.dispatchEvent(
        new CustomEvent("lcm:unitSaved", {
          detail: {
            unit: unitPayload,
            teacherName: unitData.teacherName,
            timestamp: Date.now(),
          },
        }),
      );

      return {
        success: true,
        message: `Unit "${unitPayload.name}" created successfully`,
        unit: result.unit || unitPayload,
      };
    } else {
      throw new Error(result.message || "Failed to save unit");
    }
  } catch (error) {
    console.error("[LCM-SaveUnit] ❌ Error saving unit:", error);

    // Dispatch error event
    window.dispatchEvent(
      new CustomEvent("lcm:unitSaveError", {
        detail: {
          error: error.message,
          unitData,
          timestamp: Date.now(),
        },
      }),
    );

    return {
      success: false,
      message: error.message || "Failed to save unit",
    };
  } finally {
    unitCreationState.isSaving = false;
  }
}

/**
 * Handles the save unit button click
 * This is the main entry point for saving a unit
 */
export async function handleSaveUnitClick() {
  console.log("[LCM-SaveUnit] Save unit button clicked");

  // Show loading state
  if (window.showLoadingSpinner) {
    window.showLoadingSpinner("Saving unit...", "Creating unit in database");
  }

  try {
    // Collect data from form
    const unitData = collectUnitData();

    // Save to server
    const result = await saveUnit(unitData);

    if (result.success) {
      // Show success notification
      if (window.showNotification) {
        window.showNotification(`✅ ${result.message}`, "success", 5000);
      } else {
        alert(result.message);
      }

      // Reload teacher lessons to reflect new unit
      if (window.loadTeacherLessons && unitData.teacherName) {
        console.log("[LCM-SaveUnit] Reloading teacher lessons");
        await window.loadTeacherLessons(unitData.teacherName);
      }

      // Refresh unit selector dropdown
      if (window.populateUnitSelector) {
        console.log("[LCM-SaveUnit] Refreshing unit selector dropdown");
        window.populateUnitSelector();
      }

      // Clear form
      clearUnitForm();

      return result;
    } else {
      // Show error notification
      const errorMsg = result.errors
        ? result.errors.map((e) => e.message).join("\n")
        : result.message;

      if (window.showNotification) {
        window.showNotification(
          `❌ Failed to save unit: ${errorMsg}`,
          "error",
          7000,
        );
      } else {
        alert(`Failed to save unit:\n${errorMsg}`);
      }

      // Display validation errors in UI
      if (result.errors) {
        displayValidationErrors(result.errors);
      }

      return result;
    }
  } catch (error) {
    console.error("[LCM-SaveUnit] Unexpected error:", error);

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
// UI HELPERS
// ============================================================================

/**
 * Clears the unit creation form
 */
function clearUnitForm() {
  console.log("[LCM-SaveUnit] Clearing unit form");

  const unitNumberInput = document.getElementById("newUnitNumber");
  if (unitNumberInput) {
    unitNumberInput.value = "";
  }

  const unitNameInput = document.getElementById("newUnitName");
  if (unitNameInput) {
    unitNameInput.value = "";
  }

  // Hide the create unit container
  const createUnitContainer = document.getElementById("createUnitContainer");
  if (createUnitContainer) {
    createUnitContainer.style.display = "none";
  }

  // Show the create unit button
  const createUnitBtn = document.getElementById("createUnitBtn");
  if (createUnitBtn) {
    createUnitBtn.style.display = "block";
  }

  // Clear any validation error displays
  clearValidationErrors();
}

/**
 * Displays validation errors in the UI
 * @param {Array} errors - Array of error objects
 */
function displayValidationErrors(errors) {
  console.log("[LCM-SaveUnit] Displaying validation errors");

  // Clear previous errors
  clearValidationErrors();

  // Find or create error container
  let errorContainer = document.getElementById("unitValidationErrors");
  if (!errorContainer) {
    // Create container if it doesn't exist
    const form =
      document.getElementById("unitCreationForm") ||
      document.getElementById("unitForm");
    if (form) {
      errorContainer = document.createElement("div");
      errorContainer.id = "unitValidationErrors";
      errorContainer.style.cssText = `
        background: rgba(255, 82, 82, 0.1);
        border: 1px solid #ff5252;
        border-radius: 4px;
        padding: 10px;
        margin-bottom: 15px;
      `;
      form.insertBefore(errorContainer, form.firstChild);
    }
  }

  if (errorContainer) {
    errorContainer.innerHTML = errors
      .map(
        (err) => `
      <div style="color: #ff5252; margin: 5px 0; font-size: 14px;">
        ⚠️ ${err.message}
      </div>
    `,
      )
      .join("");
  }

  // Highlight invalid fields
  errors.forEach((err) => {
    const field = document.getElementById(err.field);
    if (field) {
      field.style.borderColor = "#ff5252";
      field.style.boxShadow = "0 0 0 2px rgba(255, 82, 82, 0.2)";
    }
  });
}

/**
 * Clears validation error displays
 */
function clearValidationErrors() {
  const errorContainer = document.getElementById("unitValidationErrors");
  if (errorContainer) {
    errorContainer.innerHTML = "";
    errorContainer.style.display = "none";
  }

  // Clear field highlighting
  ["newUnitNumber", "newUnitName"].forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.style.borderColor = "";
      field.style.boxShadow = "";
    }
  });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initializes the save unit button listener
 * Call this when the unit creation form is displayed
 */
export function initializeSaveUnitListener() {
  console.log("[LCM-SaveUnit] Initializing save unit listener");

  const saveUnitBtn = document.getElementById("saveNewUnitBtn");
  if (saveUnitBtn) {
    // Remove existing listener if any
    saveUnitBtn.removeEventListener("click", handleSaveUnitClick);

    // Add listener
    saveUnitBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      await handleSaveUnitClick();
    });

    console.log("[LCM-SaveUnit] Save unit button listener attached");
  } else {
    console.warn(
      "[LCM-SaveUnit] Save unit button not found (ID: saveNewUnitBtn)",
    );
  }

  // Add cancel button listener
  const cancelUnitBtn = document.getElementById("cancelNewUnitBtn");
  if (cancelUnitBtn) {
    cancelUnitBtn.addEventListener("click", () => {
      clearUnitForm();
    });
    console.log("[LCM-SaveUnit] Cancel unit button listener attached");
  }

  // Add create unit button listener to show the form
  const createUnitBtn = document.getElementById("createUnitBtn");
  if (createUnitBtn) {
    createUnitBtn.addEventListener("click", () => {
      const createUnitContainer = document.getElementById(
        "createUnitContainer",
      );
      if (createUnitContainer) {
        createUnitContainer.style.display = "block";
        createUnitBtn.style.display = "none";
      }
    });
    console.log("[LCM-SaveUnit] Create unit button listener attached");
  }

  // Add input validation listeners
  const unitNumberInput = document.getElementById("newUnitNumber");
  if (unitNumberInput) {
    unitNumberInput.addEventListener("input", () => {
      clearValidationErrors();
    });
  }

  const unitNameInput = document.getElementById("newUnitName");
  if (unitNameInput) {
    unitNameInput.addEventListener("input", () => {
      clearValidationErrors();
    });
  }
}

/**
 * Cleans up save unit listeners
 */
export function cleanupSaveUnitListener() {
  console.log("[LCM-SaveUnit] Cleaning up save unit listener");

  const saveUnitBtn = document.getElementById("saveNewUnitBtn");
  if (saveUnitBtn) {
    saveUnitBtn.removeEventListener("click", handleSaveUnitClick);
  }

  resetUnitCreationState();
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Checks if a unit with the same value already exists for the teacher
 * @param {string} teacherName - Teacher name
 * @param {string} unitValue - Unit value (e.g., "unit1")
 * @returns {Promise<boolean>} True if unit exists, false otherwise
 */
export async function checkUnitExists(teacherName, unitValue) {
  try {
    const response = await fetch(
      `${API_CONFIG.lessonServer}/api/teacher/units?teacherName=${encodeURIComponent(teacherName)}`,
    );

    if (!response.ok) {
      throw new Error("Failed to check existing units");
    }

    const data = await response.json();

    if (data.success && data.units) {
      return data.units.some((unit) => unit.value === unitValue);
    }

    return false;
  } catch (error) {
    console.error("[LCM-SaveUnit] Error checking unit existence:", error);
    return false;
  }
}

/**
 * Suggests next available unit number for teacher
 * @param {string} teacherName - Teacher name
 * @returns {Promise<number>} Next available unit number
 */
export async function suggestNextUnitNumber(teacherName) {
  try {
    const response = await fetch(
      `${API_CONFIG.lessonServer}/api/teacher/units?teacherName=${encodeURIComponent(teacherName)}`,
    );

    if (!response.ok) {
      return 1; // Default to unit 1
    }

    const data = await response.json();

    if (data.success && data.units && data.units.length > 0) {
      // Find highest unit number
      const unitNumbers = data.units
        .map((unit) => {
          const match = unit.value.match(/unit(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter((num) => !isNaN(num));

      const maxUnitNumber = Math.max(...unitNumbers, 0);
      return maxUnitNumber + 1;
    }

    return 1; // No units yet, start with 1
  } catch (error) {
    console.error("[LCM-SaveUnit] Error suggesting unit number:", error);
    return 1;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  collectUnitData,
  validateUnitData,
  prepareUnitPayload,
  saveUnit,
  handleSaveUnitClick,
  initializeSaveUnitListener,
  cleanupSaveUnitListener,
  checkUnitExists,
  suggestNextUnitNumber,
  getUnitCreationState,
  resetUnitCreationState,
};
