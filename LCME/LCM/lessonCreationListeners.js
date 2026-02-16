/**
 * ============================================================================
 * LESSON CREATION LISTENERS MODULE
 * ============================================================================
 *
 * Purpose: Handles all UI interactions for lesson creation
 *
 * Responsibilities:
 * - Listen for button clicks in lesson creation modal
 * - Collect data from all input fields
 * - Validate lesson data before submission
 * - Prep data payload for server submission
 * - Handle file uploads (if applicable)
 * - Manage lesson blocks and intro blocks
 *
 * @module LessonCreationListeners
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let lessonCreationState = {
  isInitialized: false,
  currentLesson: null,
  lessonBlocks: [],
  introTextBlocks: [],
  learningObjectives: [],
  isDirty: false, // Track if there are unsaved changes
  validationErrors: [],
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
    isInitialized: false,
    currentLesson: null,
    lessonBlocks: [],
    introTextBlocks: [],
    learningObjectives: [],
    isDirty: false,
    validationErrors: [],
  };
  console.log("[LCM-Listeners] State reset");
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initializes all lesson creation listeners
 * Call this when the lesson creation modal is opened
 */
export function initializeLessonCreationListeners() {
  if (lessonCreationState.isInitialized) {
    console.warn("[LCM-Listeners] Already initialized");
    return;
  }

  console.log("[LCM-Listeners] Initializing lesson creation listeners");

  // Register all listeners
  registerBasicInfoListeners();
  registerLessonBlockListeners();
  registerIntroBlockListeners();
  registerLearningObjectiveListeners();
  registerSubmissionListeners();
  registerNavigationListeners();

  lessonCreationState.isInitialized = true;
  console.log("[LCM-Listeners] Initialization complete");
}

/**
 * Cleans up all lesson creation listeners
 * Call this when the lesson creation modal is closed
 */
export function cleanupLessonCreationListeners() {
  console.log("[LCM-Listeners] Cleaning up listeners");

  // Remove all event listeners
  // (Specific cleanup will be added as needed)

  lessonCreationState.isInitialized = false;
  console.log("[LCM-Listeners] Cleanup complete");
}

// ============================================================================
// BASIC LESSON INFO LISTENERS
// ============================================================================

/**
 * Registers listeners for basic lesson information fields
 */
function registerBasicInfoListeners() {
  console.log("[LCM-Listeners] Registering basic info listeners");

  // Lesson title input
  const lessonTitleInput = document.getElementById("lessonTitle");
  if (lessonTitleInput) {
    lessonTitleInput.addEventListener("input", handleLessonTitleInput);
    lessonTitleInput.addEventListener("blur", validateLessonTitle);
  }

  // Lesson description textarea
  const lessonDescInput = document.getElementById("lessonDescription");
  if (lessonDescInput) {
    lessonDescInput.addEventListener("input", handleLessonDescriptionInput);
  }

  // Unit selector
  const unitSelector = document.getElementById("lessonUnitSelector");
  if (unitSelector) {
    unitSelector.addEventListener("change", handleUnitSelection);
  }

  // Estimated time input
  const estimatedTimeInput = document.getElementById("estimatedTime");
  if (estimatedTimeInput) {
    estimatedTimeInput.addEventListener("input", handleEstimatedTimeInput);
  }

  // Difficulty level selector
  const difficultySelector = document.getElementById("difficultyLevel");
  if (difficultySelector) {
    difficultySelector.addEventListener("change", handleDifficultySelection);
  }
}

function handleLessonTitleInput(event) {
  const title = event.target.value;
  lessonCreationState.isDirty = true;

  console.log("[LCM-Listeners] Lesson title updated:", title);

  // Dispatch custom event for real-time validation
  window.dispatchEvent(
    new CustomEvent("lcm:titleChanged", {
      detail: { title },
    }),
  );
}

function validateLessonTitle(event) {
  const title = event.target.value.trim();
  const errors = [];

  if (!title) {
    errors.push("Lesson title is required");
  } else if (title.length < 3) {
    errors.push("Lesson title must be at least 3 characters");
  } else if (title.length > 100) {
    errors.push("Lesson title must be less than 100 characters");
  }

  // Update validation state
  updateValidationErrors("lessonTitle", errors);

  return errors.length === 0;
}

function handleLessonDescriptionInput(event) {
  const description = event.target.value;
  lessonCreationState.isDirty = true;

  console.log("[LCM-Listeners] Lesson description updated");
}

function handleUnitSelection(event) {
  const unitValue = event.target.value;
  lessonCreationState.isDirty = true;

  console.log("[LCM-Listeners] Unit selected:", unitValue);

  window.dispatchEvent(
    new CustomEvent("lcm:unitChanged", {
      detail: { unitValue },
    }),
  );
}

function handleEstimatedTimeInput(event) {
  const time = event.target.value;
  lessonCreationState.isDirty = true;

  console.log("[LCM-Listeners] Estimated time updated:", time);
}

function handleDifficultySelection(event) {
  const difficulty = event.target.value;
  lessonCreationState.isDirty = true;

  console.log("[LCM-Listeners] Difficulty selected:", difficulty);
}

// ============================================================================
// LESSON BLOCKS LISTENERS
// ============================================================================

/**
 * Registers listeners for lesson block management
 */
function registerLessonBlockListeners() {
  console.log("[LCM-Listeners] Registering lesson block listeners");

  // Add lesson block button
  const addBlockBtn = document.getElementById("addLessonBlockBtn");
  if (addBlockBtn) {
    addBlockBtn.addEventListener("click", handleAddLessonBlock);
  }

  // Listen for dynamically created block elements
  // Use event delegation on parent container
  const blocksContainer = document.getElementById("lessonBlocksContainer");
  if (blocksContainer) {
    blocksContainer.addEventListener("click", handleLessonBlockActions);
    blocksContainer.addEventListener("input", handleLessonBlockInput);
    blocksContainer.addEventListener("change", handleLessonBlockChange);
  }
}

function handleAddLessonBlock(event) {
  event.preventDefault();

  console.log("[LCM-Listeners] Adding new lesson block");

  const blockId = `block_${Date.now()}`;
  const newBlock = {
    id: blockId,
    type: "text", // default type
    content: "",
    order: lessonCreationState.lessonBlocks.length,
    createdAt: new Date().toISOString(),
  };

  lessonCreationState.lessonBlocks.push(newBlock);
  lessonCreationState.isDirty = true;

  // Dispatch event for UI to render the block
  window.dispatchEvent(
    new CustomEvent("lcm:blockAdded", {
      detail: { block: newBlock },
    }),
  );
}

function handleLessonBlockActions(event) {
  const target = event.target;

  // Delete block
  if (
    target.classList.contains("delete-block-btn") ||
    target.closest(".delete-block-btn")
  ) {
    const blockElement = target.closest("[data-block-id]");
    if (blockElement) {
      const blockId = blockElement.dataset.blockId;
      handleDeleteLessonBlock(blockId);
    }
  }

  // Move block up
  if (
    target.classList.contains("move-block-up-btn") ||
    target.closest(".move-block-up-btn")
  ) {
    const blockElement = target.closest("[data-block-id]");
    if (blockElement) {
      const blockId = blockElement.dataset.blockId;
      handleMoveBlockUp(blockId);
    }
  }

  // Move block down
  if (
    target.classList.contains("move-block-down-btn") ||
    target.closest(".move-block-down-btn")
  ) {
    const blockElement = target.closest("[data-block-id]");
    if (blockElement) {
      const blockId = blockElement.dataset.blockId;
      handleMoveBlockDown(blockId);
    }
  }

  // Duplicate block
  if (
    target.classList.contains("duplicate-block-btn") ||
    target.closest(".duplicate-block-btn")
  ) {
    const blockElement = target.closest("[data-block-id]");
    if (blockElement) {
      const blockId = blockElement.dataset.blockId;
      handleDuplicateBlock(blockId);
    }
  }
}

function handleLessonBlockInput(event) {
  const target = event.target;
  const blockElement = target.closest("[data-block-id]");

  if (!blockElement) return;

  const blockId = blockElement.dataset.blockId;
  const fieldName = target.dataset.field || target.name;
  const value = target.value;

  updateLessonBlockData(blockId, fieldName, value);
}

function handleLessonBlockChange(event) {
  const target = event.target;
  const blockElement = target.closest("[data-block-id]");

  if (!blockElement) return;

  const blockId = blockElement.dataset.blockId;

  // Handle block type change
  if (target.classList.contains("block-type-selector")) {
    const newType = target.value;
    handleBlockTypeChange(blockId, newType);
  }
}

function updateLessonBlockData(blockId, field, value) {
  const block = lessonCreationState.lessonBlocks.find((b) => b.id === blockId);

  if (block) {
    block[field] = value;
    lessonCreationState.isDirty = true;

    console.log(`[LCM-Listeners] Block ${blockId} ${field} updated`);
  }
}

function handleDeleteLessonBlock(blockId) {
  const confirmed = confirm("Are you sure you want to delete this block?");
  if (!confirmed) return;

  console.log("[LCM-Listeners] Deleting block:", blockId);

  lessonCreationState.lessonBlocks = lessonCreationState.lessonBlocks.filter(
    (b) => b.id !== blockId,
  );
  lessonCreationState.isDirty = true;

  // Reorder remaining blocks
  lessonCreationState.lessonBlocks.forEach((block, index) => {
    block.order = index;
  });

  window.dispatchEvent(
    new CustomEvent("lcm:blockDeleted", {
      detail: { blockId },
    }),
  );
}

function handleMoveBlockUp(blockId) {
  const blockIndex = lessonCreationState.lessonBlocks.findIndex(
    (b) => b.id === blockId,
  );

  if (blockIndex > 0) {
    // Swap with previous block
    const temp = lessonCreationState.lessonBlocks[blockIndex];
    lessonCreationState.lessonBlocks[blockIndex] =
      lessonCreationState.lessonBlocks[blockIndex - 1];
    lessonCreationState.lessonBlocks[blockIndex - 1] = temp;

    // Update order
    lessonCreationState.lessonBlocks.forEach((block, index) => {
      block.order = index;
    });

    lessonCreationState.isDirty = true;

    window.dispatchEvent(
      new CustomEvent("lcm:blockMoved", {
        detail: { blockId, direction: "up" },
      }),
    );
  }
}

function handleMoveBlockDown(blockId) {
  const blockIndex = lessonCreationState.lessonBlocks.findIndex(
    (b) => b.id === blockId,
  );

  if (blockIndex < lessonCreationState.lessonBlocks.length - 1) {
    // Swap with next block
    const temp = lessonCreationState.lessonBlocks[blockIndex];
    lessonCreationState.lessonBlocks[blockIndex] =
      lessonCreationState.lessonBlocks[blockIndex + 1];
    lessonCreationState.lessonBlocks[blockIndex + 1] = temp;

    // Update order
    lessonCreationState.lessonBlocks.forEach((block, index) => {
      block.order = index;
    });

    lessonCreationState.isDirty = true;

    window.dispatchEvent(
      new CustomEvent("lcm:blockMoved", {
        detail: { blockId, direction: "down" },
      }),
    );
  }
}

function handleDuplicateBlock(blockId) {
  console.log("[LCM-Listeners] Duplicating block:", blockId);

  const originalBlock = lessonCreationState.lessonBlocks.find(
    (b) => b.id === blockId,
  );
  if (!originalBlock) return;

  const duplicateBlock = {
    ...originalBlock,
    id: `block_${Date.now()}`,
    order: originalBlock.order + 1,
    createdAt: new Date().toISOString(),
  };

  // Insert after original block
  lessonCreationState.lessonBlocks.splice(
    originalBlock.order + 1,
    0,
    duplicateBlock,
  );

  // Reorder
  lessonCreationState.lessonBlocks.forEach((block, index) => {
    block.order = index;
  });

  lessonCreationState.isDirty = true;

  window.dispatchEvent(
    new CustomEvent("lcm:blockDuplicated", {
      detail: { originalBlockId: blockId, newBlock: duplicateBlock },
    }),
  );
}

function handleBlockTypeChange(blockId, newType) {
  console.log(`[LCM-Listeners] Changing block ${blockId} type to ${newType}`);

  const block = lessonCreationState.lessonBlocks.find((b) => b.id === blockId);
  if (block) {
    block.type = newType;
    lessonCreationState.isDirty = true;

    window.dispatchEvent(
      new CustomEvent("lcm:blockTypeChanged", {
        detail: { blockId, newType },
      }),
    );
  }
}

// ============================================================================
// INTRO TEXT BLOCKS LISTENERS
// ============================================================================

/**
 * Registers listeners for intro text block management
 */
function registerIntroBlockListeners() {
  console.log("[LCM-Listeners] Registering intro block listeners");

  // Add intro block button
  const addIntroBlockBtn = document.getElementById("addIntroBlockBtn");
  if (addIntroBlockBtn) {
    addIntroBlockBtn.addEventListener("click", handleAddIntroBlock);
  }

  // Use event delegation for intro blocks
  const introBlocksContainer = document.getElementById("introBlocksContainer");
  if (introBlocksContainer) {
    introBlocksContainer.addEventListener("click", handleIntroBlockActions);
    introBlocksContainer.addEventListener("input", handleIntroBlockInput);
  }
}

function handleAddIntroBlock(event) {
  event.preventDefault();

  console.log("[LCM-Listeners] Adding new intro text block");

  const blockId = `intro_${Date.now()}`;
  const newIntroBlock = {
    id: blockId,
    content: "",
    order: lessonCreationState.introTextBlocks.length,
    createdAt: new Date().toISOString(),
  };

  lessonCreationState.introTextBlocks.push(newIntroBlock);
  lessonCreationState.isDirty = true;

  window.dispatchEvent(
    new CustomEvent("lcm:introBlockAdded", {
      detail: { block: newIntroBlock },
    }),
  );
}

function handleIntroBlockActions(event) {
  const target = event.target;

  // Delete intro block
  if (
    target.classList.contains("delete-intro-block-btn") ||
    target.closest(".delete-intro-block-btn")
  ) {
    const blockElement = target.closest("[data-intro-block-id]");
    if (blockElement) {
      const blockId = blockElement.dataset.introBlockId;
      handleDeleteIntroBlock(blockId);
    }
  }

  // Move intro block
  if (
    target.classList.contains("move-intro-up-btn") ||
    target.closest(".move-intro-up-btn")
  ) {
    const blockElement = target.closest("[data-intro-block-id]");
    if (blockElement) {
      const blockId = blockElement.dataset.introBlockId;
      handleMoveIntroBlockUp(blockId);
    }
  }

  if (
    target.classList.contains("move-intro-down-btn") ||
    target.closest(".move-intro-down-btn")
  ) {
    const blockElement = target.closest("[data-intro-block-id]");
    if (blockElement) {
      const blockId = blockElement.dataset.introBlockId;
      handleMoveIntroBlockDown(blockId);
    }
  }
}

function handleIntroBlockInput(event) {
  const target = event.target;
  const blockElement = target.closest("[data-intro-block-id]");

  if (!blockElement) return;

  const blockId = blockElement.dataset.introBlockId;
  const content = target.value;

  const block = lessonCreationState.introTextBlocks.find(
    (b) => b.id === blockId,
  );
  if (block) {
    block.content = content;
    lessonCreationState.isDirty = true;
  }
}

function handleDeleteIntroBlock(blockId) {
  const confirmed = confirm("Delete this intro block?");
  if (!confirmed) return;

  lessonCreationState.introTextBlocks =
    lessonCreationState.introTextBlocks.filter((b) => b.id !== blockId);
  lessonCreationState.isDirty = true;

  // Reorder
  lessonCreationState.introTextBlocks.forEach((block, index) => {
    block.order = index;
  });

  window.dispatchEvent(
    new CustomEvent("lcm:introBlockDeleted", {
      detail: { blockId },
    }),
  );
}

function handleMoveIntroBlockUp(blockId) {
  const blockIndex = lessonCreationState.introTextBlocks.findIndex(
    (b) => b.id === blockId,
  );

  if (blockIndex > 0) {
    const temp = lessonCreationState.introTextBlocks[blockIndex];
    lessonCreationState.introTextBlocks[blockIndex] =
      lessonCreationState.introTextBlocks[blockIndex - 1];
    lessonCreationState.introTextBlocks[blockIndex - 1] = temp;

    lessonCreationState.introTextBlocks.forEach((block, index) => {
      block.order = index;
    });

    lessonCreationState.isDirty = true;

    window.dispatchEvent(
      new CustomEvent("lcm:introBlockMoved", {
        detail: { blockId, direction: "up" },
      }),
    );
  }
}

function handleMoveIntroBlockDown(blockId) {
  const blockIndex = lessonCreationState.introTextBlocks.findIndex(
    (b) => b.id === blockId,
  );

  if (blockIndex < lessonCreationState.introTextBlocks.length - 1) {
    const temp = lessonCreationState.introTextBlocks[blockIndex];
    lessonCreationState.introTextBlocks[blockIndex] =
      lessonCreationState.introTextBlocks[blockIndex + 1];
    lessonCreationState.introTextBlocks[blockIndex + 1] = temp;

    lessonCreationState.introTextBlocks.forEach((block, index) => {
      block.order = index;
    });

    lessonCreationState.isDirty = true;

    window.dispatchEvent(
      new CustomEvent("lcm:introBlockMoved", {
        detail: { blockId, direction: "down" },
      }),
    );
  }
}

// ============================================================================
// LEARNING OBJECTIVES LISTENERS
// ============================================================================

/**
 * Registers listeners for learning objectives
 */
function registerLearningObjectiveListeners() {
  console.log("[LCM-Listeners] Registering learning objective listeners");

  // Add objective button
  const addObjectiveBtn = document.getElementById("addLearningObjectiveBtn");
  if (addObjectiveBtn) {
    addObjectiveBtn.addEventListener("click", handleAddLearningObjective);
  }

  // Use event delegation
  const objectivesContainer = document.getElementById(
    "learningObjectivesContainer",
  );
  if (objectivesContainer) {
    objectivesContainer.addEventListener("click", handleObjectiveActions);
    objectivesContainer.addEventListener("input", handleObjectiveInput);
  }
}

function handleAddLearningObjective(event) {
  event.preventDefault();

  console.log("[LCM-Listeners] Adding new learning objective");

  const objectiveId = `objective_${Date.now()}`;
  const newObjective = {
    id: objectiveId,
    text: "",
    order: lessonCreationState.learningObjectives.length,
    createdAt: new Date().toISOString(),
  };

  lessonCreationState.learningObjectives.push(newObjective);
  lessonCreationState.isDirty = true;

  window.dispatchEvent(
    new CustomEvent("lcm:objectiveAdded", {
      detail: { objective: newObjective },
    }),
  );
}

function handleObjectiveActions(event) {
  const target = event.target;

  // Delete objective
  if (
    target.classList.contains("delete-objective-btn") ||
    target.closest(".delete-objective-btn")
  ) {
    const objectiveElement = target.closest("[data-objective-id]");
    if (objectiveElement) {
      const objectiveId = objectiveElement.dataset.objectiveId;
      handleDeleteObjective(objectiveId);
    }
  }
}

function handleObjectiveInput(event) {
  const target = event.target;
  const objectiveElement = target.closest("[data-objective-id]");

  if (!objectiveElement) return;

  const objectiveId = objectiveElement.dataset.objectiveId;
  const text = target.value;

  const objective = lessonCreationState.learningObjectives.find(
    (o) => o.id === objectiveId,
  );
  if (objective) {
    objective.text = text;
    lessonCreationState.isDirty = true;
  }
}

function handleDeleteObjective(objectiveId) {
  lessonCreationState.learningObjectives =
    lessonCreationState.learningObjectives.filter((o) => o.id !== objectiveId);
  lessonCreationState.isDirty = true;

  // Reorder
  lessonCreationState.learningObjectives.forEach((objective, index) => {
    objective.order = index;
  });

  window.dispatchEvent(
    new CustomEvent("lcm:objectiveDeleted", {
      detail: { objectiveId },
    }),
  );
}

// ============================================================================
// SUBMISSION LISTENERS
// ============================================================================

/**
 * Registers listeners for form submission
 */
function registerSubmissionListeners() {
  console.log("[LCM-Listeners] Registering submission listeners");

  // Save lesson button
  const saveLessonBtn = document.getElementById("saveLessonBtn");
  if (saveLessonBtn) {
    saveLessonBtn.addEventListener("click", handleSaveLesson);
  }

  // Save and close button
  const saveAndCloseBtn = document.getElementById("saveAndCloseLessonBtn");
  if (saveAndCloseBtn) {
    saveAndCloseBtn.addEventListener("click", handleSaveAndClose);
  }

  // Preview lesson button
  const previewBtn = document.getElementById("previewLessonBtn");
  if (previewBtn) {
    previewBtn.addEventListener("click", handlePreviewLesson);
  }
}

async function handleSaveLesson(event) {
  event.preventDefault();

  console.log("[LCM-Listeners] Save lesson requested");

  // Collect and validate data
  const lessonData = collectLessonData();
  const isValid = validateLessonData(lessonData);

  if (!isValid) {
    console.error(
      "[LCM-Listeners] Validation failed:",
      lessonCreationState.validationErrors,
    );

    // Dispatch validation error event
    window.dispatchEvent(
      new CustomEvent("lcm:validationFailed", {
        detail: { errors: lessonCreationState.validationErrors },
      }),
    );

    return;
  }

  // Dispatch save event with prepared data
  window.dispatchEvent(
    new CustomEvent("lcm:saveRequested", {
      detail: { lessonData, closeAfterSave: false },
    }),
  );
}

async function handleSaveAndClose(event) {
  event.preventDefault();

  console.log("[LCM-Listeners] Save and close requested");

  const lessonData = collectLessonData();
  const isValid = validateLessonData(lessonData);

  if (!isValid) {
    window.dispatchEvent(
      new CustomEvent("lcm:validationFailed", {
        detail: { errors: lessonCreationState.validationErrors },
      }),
    );
    return;
  }

  window.dispatchEvent(
    new CustomEvent("lcm:saveRequested", {
      detail: { lessonData, closeAfterSave: true },
    }),
  );
}

function handlePreviewLesson(event) {
  event.preventDefault();

  console.log("[LCM-Listeners] Preview requested");

  const lessonData = collectLessonData();

  window.dispatchEvent(
    new CustomEvent("lcm:previewRequested", {
      detail: { lessonData },
    }),
  );
}

// ============================================================================
// NAVIGATION LISTENERS
// ============================================================================

/**
 * Registers listeners for modal navigation/closing
 */
function registerNavigationListeners() {
  console.log("[LCM-Listeners] Registering navigation listeners");

  // Cancel button
  const cancelBtn = document.getElementById("cancelLessonCreationBtn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", handleCancelLessonCreation);
  }

  // Close modal X button
  const closeModalBtn = document.getElementById("closeLessonCreationModal");
  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", handleCancelLessonCreation);
  }
}

function handleCancelLessonCreation(event) {
  event.preventDefault();

  console.log("[LCM-Listeners] Cancel requested");

  // Check for unsaved changes
  if (lessonCreationState.isDirty) {
    const confirmed = confirm(
      "You have unsaved changes. Are you sure you want to close?",
    );
    if (!confirmed) {
      return;
    }
  }

  window.dispatchEvent(
    new CustomEvent("lcm:cancelRequested", {
      detail: { hadUnsavedChanges: lessonCreationState.isDirty },
    }),
  );

  // Reset state
  resetLessonCreationState();
}

// ============================================================================
// DATA COLLECTION & VALIDATION
// ============================================================================

/**
 * Collects all lesson data from the form
 * @returns {Object} Complete lesson data object ready for server
 */
export function collectLessonData() {
  console.log("[LCM-Listeners] Collecting lesson data");

  // Basic info
  const lessonTitle =
    document.getElementById("lessonTitle")?.value.trim() || "";
  const lessonDescription =
    document.getElementById("lessonDescription")?.value.trim() || "";
  const unitValue = document.getElementById("lessonUnitSelector")?.value || "";
  const estimatedTime = document.getElementById("estimatedTime")?.value || "";
  const difficultyLevel =
    document.getElementById("difficultyLevel")?.value || "medium";

  // Prepare lesson data payload
  const lessonData = {
    lesson_title: lessonTitle,
    lesson_description: lessonDescription,
    unit: unitValue,
    estimated_time: estimatedTime,
    difficulty: difficultyLevel,
    teacher: window.activeTeacherName || "",

    // Blocks
    lesson_blocks: lessonCreationState.lessonBlocks.map((block) => ({
      type: block.type,
      content: block.content,
      order: block.order,
      // Include any additional block-specific fields
      ...block,
    })),

    // Intro blocks
    intro_text_blocks: lessonCreationState.introTextBlocks.map((block) => ({
      content: block.content,
      order: block.order,
    })),

    // Learning objectives
    learning_objectives: lessonCreationState.learningObjectives
      .map((obj) => obj.text.trim())
      .filter((text) => text.length > 0),

    // Metadata
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
  };

  console.log("[LCM-Listeners] Lesson data collected:", lessonData);

  return lessonData;
}

/**
 * Validates lesson data before submission
 * @param {Object} lessonData - Lesson data to validate
 * @returns {boolean} True if valid, false otherwise
 */
export function validateLessonData(lessonData) {
  console.log("[LCM-Listeners] Validating lesson data");

  lessonCreationState.validationErrors = [];

  // Required fields
  if (!lessonData.lesson_title) {
    lessonCreationState.validationErrors.push({
      field: "lesson_title",
      message: "Lesson title is required",
    });
  }

  if (!lessonData.unit) {
    lessonCreationState.validationErrors.push({
      field: "unit",
      message: "Please select a unit",
    });
  }

  if (!lessonData.teacher) {
    lessonCreationState.validationErrors.push({
      field: "teacher",
      message: "Teacher information is missing",
    });
  }

  // Lesson blocks validation
  if (!lessonData.lesson_blocks || lessonData.lesson_blocks.length === 0) {
    lessonCreationState.validationErrors.push({
      field: "lesson_blocks",
      message: "At least one lesson block is required",
    });
  }

  // Validate each block has content
  lessonData.lesson_blocks.forEach((block, index) => {
    if (!block.content || block.content.trim().length === 0) {
      lessonCreationState.validationErrors.push({
        field: `lesson_blocks[${index}]`,
        message: `Block ${index + 1} is empty`,
      });
    }
  });

  const isValid = lessonCreationState.validationErrors.length === 0;

  console.log(
    "[LCM-Listeners] Validation result:",
    isValid ? "PASSED" : "FAILED",
  );
  if (!isValid) {
    console.log(
      "[LCM-Listeners] Validation errors:",
      lessonCreationState.validationErrors,
    );
  }

  return isValid;
}

/**
 * Updates validation errors for a specific field
 * @param {string} field - Field name
 * @param {Array} errors - Array of error messages
 */
function updateValidationErrors(field, errors) {
  // Remove existing errors for this field
  lessonCreationState.validationErrors =
    lessonCreationState.validationErrors.filter((err) => err.field !== field);

  // Add new errors
  errors.forEach((message) => {
    lessonCreationState.validationErrors.push({ field, message });
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Loads existing lesson data into the form (for editing)
 * @param {Object} lessonData - Existing lesson data
 */
export function loadExistingLessonData(lessonData) {
  console.log("[LCM-Listeners] Loading existing lesson data");

  // Populate basic fields
  const lessonTitleInput = document.getElementById("lessonTitle");
  if (lessonTitleInput && lessonData.lesson_title) {
    lessonTitleInput.value = lessonData.lesson_title;
  }

  const lessonDescInput = document.getElementById("lessonDescription");
  if (lessonDescInput && lessonData.lesson_description) {
    lessonDescInput.value = lessonData.lesson_description;
  }

  const unitSelector = document.getElementById("lessonUnitSelector");
  if (unitSelector && lessonData.unit) {
    unitSelector.value = lessonData.unit;
  }

  const estimatedTimeInput = document.getElementById("estimatedTime");
  if (estimatedTimeInput && lessonData.estimated_time) {
    estimatedTimeInput.value = lessonData.estimated_time;
  }

  const difficultySelector = document.getElementById("difficultyLevel");
  if (difficultySelector && lessonData.difficulty) {
    difficultySelector.value = lessonData.difficulty;
  }

  // Load blocks
  if (lessonData.lesson_blocks) {
    lessonCreationState.lessonBlocks = lessonData.lesson_blocks.map(
      (block, index) => ({
        ...block,
        id: block.id || `block_${Date.now()}_${index}`,
        order: index,
      }),
    );
  }

  // Load intro blocks
  if (lessonData.intro_text_blocks) {
    lessonCreationState.introTextBlocks = lessonData.intro_text_blocks.map(
      (block, index) => ({
        ...block,
        id: block.id || `intro_${Date.now()}_${index}`,
        order: index,
      }),
    );
  }

  // Load learning objectives
  if (lessonData.learning_objectives) {
    lessonCreationState.learningObjectives = lessonData.learning_objectives.map(
      (text, index) => ({
        id: `objective_${Date.now()}_${index}`,
        text: typeof text === "string" ? text : text.text || "",
        order: index,
      }),
    );
  }

  lessonCreationState.currentLesson = lessonData;
  lessonCreationState.isDirty = false;

  console.log("[LCM-Listeners] Existing lesson data loaded");
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initializeLessonCreationListeners,
  cleanupLessonCreationListeners,
  collectLessonData,
  validateLessonData,
  loadExistingLessonData,
  getLessonCreationState,
  resetLessonCreationState,
};
