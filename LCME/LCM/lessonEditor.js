/**
 * ============================================================================
 * LESSON EDITOR MODULE (LCM)
 * ============================================================================
 *
 * Purpose: Handles lesson editing functionality
 *
 * Responsibilities:
 * - Fetch teacher's lessons from server
 * - Populate edit lesson selector dropdown
 * - Load lesson data into the creation form for editing
 * - Update existing lessons (overwrite with new data)
 *
 * Dependencies:
 * - adminOverride.js (AOM) for unit/lesson fetching with admin override
 * - Server endpoint: GET /lesson/:lessonId (fetch single lesson)
 * - Server endpoint: POST /api/lessons/update (update existing lesson)
 *
 * @module LessonEditor
 */

// API Configuration
const API_CONFIG = {
  lessonServer: "http://localhost:4000",
  mainServer: "http://localhost:3000",
};

// ============================================================================
// LESSON FETCHING & LOADING
// ============================================================================

/**
 * Loads all lessons for a teacher using the AOM (Admin Override Module)
 * @param {string} teacherName - Teacher's name/email
 * @returns {Promise<void>}
 */
export async function loadTeacherLessons(teacherName) {
  try {
    console.log(`[LCM-Editor] Loading lessons for teacher: ${teacherName}`);

    // Use the AOM module to get units with admin override logic
    const unitsData = await window.getTeacherUnitsWithOverride(teacherName);

    console.log("[LCM-Editor] Units data loaded:", {
      unitCount: unitsData.units.length,
      isAdminOverride: unitsData.isAdminOverride,
      isReadOnly: unitsData.isReadOnly,
      source: unitsData.source,
      canCopy: unitsData.canCopy,
    });

    // Separate admin units from teacher's own units
    if (unitsData.isAdminOverride) {
      // Teacher has no units - showing admin's default units
      window.adminDefaultUnits = unitsData.units || [];
      window.teacherOwnUnits = []; // Teacher has no custom units
      window.teacherUnits = unitsData.units || []; // Display admin units
      console.log(
        "[LCM-Editor] Using admin override - teacher has no custom units",
      );
    } else {
      // Teacher has their own custom units
      window.teacherOwnUnits = unitsData.units || [];
      window.adminDefaultUnits = []; // Not using admin units
      window.teacherUnits = unitsData.units || []; // Display teacher's units
      console.log(
        "[LCM-Editor] Using teacher's own custom units:",
        window.teacherOwnUnits.length,
      );
    }

    // Flatten all lessons from all units into a flat list
    window.allTeacherLessons = [];
    unitsData.units.forEach((unit) => {
      if (unit.lessons && Array.isArray(unit.lessons)) {
        unit.lessons.forEach((lesson) => {
          window.allTeacherLessons.push({
            ...lesson,
            unit: unit.name,
            unitValue: unit.value,
            isAdminContent: unit.isAdminUnit || false,
          });
        });
      }
    });

    // Store override information
    window.masterTeacher = unitsData.isAdminOverride
      ? "admin@trinity-capital.net"
      : null;
    window.isUsingMasterDefaults = unitsData.isAdminOverride;
    window.hasOwnContent = !unitsData.isAdminOverride;
    window.contentType = unitsData.isAdminOverride
      ? "default"
      : unitsData.units.length > 0
        ? "own"
        : "none";

    // IMPORTANT FIX: Only fetch admin lessons if the current user IS admin
    // Non-admin users should not see admin lessons in their edit dropdown
    const isAdmin = teacherName.includes("admin@trinity-capital.net");

    if (isAdmin) {
      // Admin is logged in - their lessons are already in allTeacherLessons
      window.adminLessons = [...window.allTeacherLessons];
      console.log(
        `[LCM-Editor] Admin user - ${window.adminLessons.length} lessons loaded`,
      );
    } else {
      // Non-admin users should NOT see admin lessons
      window.adminLessons = [];
      console.log("[LCM-Editor] Non-admin user - admin lessons not loaded");
    }

    console.log(`[LCM-Editor] Teacher units loaded:`, {
      unitCount: window.teacherUnits.length,
      lessonCount: window.allTeacherLessons.length,
      hasOwnContent: window.hasOwnContent,
      isUsingAdminOverride: window.isUsingMasterDefaults,
    });

    // Log appropriate notifications based on content type
    if (window.contentType === "default") {
      console.log(
        `📚 Teacher has no content yet - showing default content from admin account`,
      );
    } else if (window.contentType === "own") {
      console.log(
        `✅ Teacher has ${window.teacherUnits.length} custom units with ${window.allTeacherLessons.length} lessons`,
      );
    } else {
      console.log(`⚠️ Teacher has no units or lessons`);
    }

    return {
      success: true,
      units: window.teacherUnits,
      lessons: window.allTeacherLessons,
      isAdminOverride: unitsData.isAdminOverride,
    };
  } catch (error) {
    console.error("[LCM-Editor] Error loading teacher lessons:", error);
    window.allTeacherLessons = [];
    window.teacherUnits = [];
    window.adminLessons = [];
    throw error;
  }
}

// ============================================================================
// EDIT LESSON SELECTOR POPULATION
// ============================================================================

/**
 * Populates the edit lesson selector dropdown
 * Shows only the logged-in teacher's lessons (no admin lessons for non-admin)
 */
export function populateEditLessonSelector() {
  console.log("[LCM-Editor] Populating edit lesson selector");

  const editLessonSelector = document.getElementById("editLessonSelector");
  if (!editLessonSelector) {
    console.warn("[LCM-Editor] Edit lesson selector not found");
    return;
  }

  editLessonSelector.innerHTML =
    '<option value="">-- Select a lesson to edit --</option>';

  // Only show lessons that belong to the currently logged-in teacher
  // Teachers should NOT be able to edit admin lessons, only their own
  const allLessons = [];

  if (window.allTeacherLessons && window.allTeacherLessons.length > 0) {
    // Filter to only include lessons that belong to the current teacher
    const currentTeacher = window.activeTeacherName;
    const ownLessons = window.allTeacherLessons.filter((lesson) => {
      // Only include lessons created by the current teacher
      // This excludes admin lessons from the edit dropdown for non-admin users
      return lesson.teacher === currentTeacher;
    });

    allLessons.push(...ownLessons);

    console.log(`[LCM-Editor] Filtered lessons for editing:`, {
      totalLessons: window.allTeacherLessons.length,
      ownLessons: ownLessons.length,
      currentTeacher: currentTeacher,
    });
  } else {
    console.log("[LCM-Editor] No teacher lessons available");
  }

  // Sort lessons by title
  allLessons.sort((a, b) => {
    return (a.lesson_title || "").localeCompare(b.lesson_title || "");
  });

  // Populate dropdown with only the teacher's own lessons
  allLessons.forEach((lesson) => {
    const option = document.createElement("option");
    option.value = lesson._id;
    option.textContent = `${lesson.lesson_title} (${lesson.unit || "No Unit"})`;
    editLessonSelector.appendChild(option);
  });

  // Show message if no editable lessons
  if (allLessons.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No lessons available to edit";
    option.disabled = true;
    editLessonSelector.appendChild(option);
  }

  console.log(
    `[LCM-Editor] Populated ${allLessons.length} lessons in selector`,
  );
}

// ============================================================================
// LESSON DATA POPULATION FOR EDITING
// ============================================================================

/**
 * Populates the lesson creation form with data from an existing lesson
 * @param {Object} lesson - Lesson object with all data
 */
export function populateLessonForEditing(lesson) {
  console.log("[LCM-Editor] === POPULATING LESSON FOR EDITING ===");
  console.log("[LCM-Editor] Lesson object received:", lesson);
  console.log("[LCM-Editor] Lesson blocks:", lesson.lesson_blocks);
  console.log("[LCM-Editor] Lesson conditions:", lesson.lesson_conditions);
  console.log("[LCM-Editor] Intro text blocks:", lesson.intro_text_blocks);

  // Set lesson title
  const lessonTitleInput = document.getElementById("lessonTitle");
  if (lessonTitleInput) {
    lessonTitleInput.value = lesson.lesson_title || "";
  }

  // Set lesson description
  const lessonDescriptionInput = document.getElementById("lessonDescription");
  if (lessonDescriptionInput) {
    lessonDescriptionInput.value = lesson.lesson_description || "";
  }

  // Set unit selector
  const unitSelector = document.getElementById("unitSelector");
  if (unitSelector && lesson.unit) {
    const unitValue = lesson.unit.value || lesson.unitValue;
    if (unitValue) {
      unitSelector.value = unitValue;
      console.log("[LCM-Editor] Set unit selector to:", unitValue);
    }
  }

  // Clear existing blocks
  const introBlocksContainer = document.getElementById("introBlocksContainer");
  const conditionsContainer = document.getElementById("conditionsContainer");

  if (introBlocksContainer) {
    introBlocksContainer.innerHTML = "";
  }
  if (conditionsContainer) {
    conditionsContainer.innerHTML = "";
  }

  // Helper function to render a single content block
  const renderBlock = (blockData, container) => {
    const block = document.createElement("div");
    block.className = "content-block";
    block.dataset.blockType = blockData.type;

    let innerHTML = `<button type="button" class="remove-btn">&times;</button>`;

    // Handle both new format (header/text/video) and legacy format (intro)
    const blockType = blockData.type;

    switch (blockType) {
      case "header":
        innerHTML += `<label>Header</label><input type="text" class="dialog-input" placeholder="Enter header text..." value="${blockData.content || ""}" data-field-name="content">`;
        break;
      case "text":
        innerHTML += `<label>Text Block</label><textarea class="dialog-textarea" placeholder="Enter paragraph text..." data-field-name="content">${blockData.content || ""}</textarea>`;
        break;
      case "video":
        innerHTML += `<label>Video URL or YouTube Embed</label><input type="text" class="dialog-input video-url-input" placeholder="e.g., https://www.youtube.com/watch?v=... or .mp4 URL" value="${blockData.url || ""}" data-field-name="url">
        <div class="video-preview-container" style="margin-top: 0.5em; display: none;"></div>`;
        break;
      case "intro":
        // Legacy format: convert to text block
        innerHTML += `<label>Text Block (Intro)</label><textarea class="dialog-textarea" placeholder="Enter paragraph text..." data-field-name="content">${blockData.content || ""}</textarea>`;
        block.dataset.blockType = "text"; // Normalize to text type
        break;
      default:
        // Unknown type, treat as text
        innerHTML += `<label>Text Block</label><textarea class="dialog-textarea" placeholder="Enter paragraph text..." data-field-name="content">${blockData.content || ""}</textarea>`;
        block.dataset.blockType = "text";
    }

    block.innerHTML = innerHTML;
    container.appendChild(block);

    // Add event listeners for the remove button
    const removeBtn = block.querySelector(".remove-btn");
    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        block.remove();
      });
    }

    // If it's a video block, trigger preview update
    if (blockType === "video" && blockData.url) {
      const previewContainer = block.querySelector(".video-preview-container");
      const embedUrl = window.getYoutubeEmbedUrl
        ? window.getYoutubeEmbedUrl(blockData.url)
        : blockData.url;

      if (embedUrl && previewContainer) {
        previewContainer.style.display = "block";
        if (embedUrl.includes("youtube.com/embed")) {
          previewContainer.innerHTML = `<iframe width="100%" height="150" src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius: 8px;"></iframe>`;
        } else {
          previewContainer.innerHTML = `<video width="100%" height="150" controls src="${embedUrl}" style="border-radius: 8px;"></video>`;
        }
      }
    }
  };

  // Populate intro blocks - check all possible field names in order
  // Support three formats: lesson_blocks (new), intro_text_blocks (legacy intro), content (alternative)
  const blocksToUse =
    lesson.lesson_blocks || lesson.intro_text_blocks || lesson.content || [];

  console.log("[LCM-Editor] === BLOCK POPULATION DEBUG ===");
  console.log(
    "[LCM-Editor] lesson.lesson_blocks exists?",
    !!lesson.lesson_blocks,
  );
  console.log("[LCM-Editor] lesson.lesson_blocks value:", lesson.lesson_blocks);
  console.log(
    "[LCM-Editor] lesson.intro_text_blocks exists?",
    !!lesson.intro_text_blocks,
  );
  console.log(
    "[LCM-Editor] lesson.intro_text_blocks value:",
    lesson.intro_text_blocks,
  );
  console.log("[LCM-Editor] lesson.content exists?", !!lesson.content);
  console.log("[LCM-Editor] lesson.content value:", lesson.content);
  console.log("[LCM-Editor] blocksToUse:", blocksToUse);
  console.log("[LCM-Editor] blocksToUse is array?", Array.isArray(blocksToUse));
  console.log("[LCM-Editor] blocksToUse length:", blocksToUse.length);

  if (
    blocksToUse &&
    Array.isArray(blocksToUse) &&
    blocksToUse.length > 0 &&
    introBlocksContainer
  ) {
    console.log(
      `[LCM-Editor] ✅ Found ${blocksToUse.length} intro blocks, populating in order:`,
      blocksToUse,
    );
    blocksToUse.forEach((blockData, index) => {
      console.log(`[LCM-Editor] Block ${index}:`, blockData);
      renderBlock(blockData, introBlocksContainer);
    });
  } else {
    console.log(
      "[LCM-Editor] ❌ No lesson_blocks or intro_text_blocks found in lesson data",
    );
    console.log("[LCM-Editor] Full lesson object keys:", Object.keys(lesson));
  }

  // Populate conditions
  const conditionsToUse = lesson.lesson_conditions || lesson.conditions || [];

  console.log("[LCM-Editor] === CONDITIONS POPULATION DEBUG ===");
  console.log(
    "[LCM-Editor] lesson.lesson_conditions exists?",
    !!lesson.lesson_conditions,
  );
  console.log(
    "[LCM-Editor] lesson.lesson_conditions value:",
    lesson.lesson_conditions,
  );
  console.log("[LCM-Editor] lesson.conditions exists?", !!lesson.conditions);
  console.log("[LCM-Editor] lesson.conditions value:", lesson.conditions);
  console.log("[LCM-Editor] conditionsToUse:", conditionsToUse);
  console.log(
    "[LCM-Editor] conditionsToUse is array?",
    Array.isArray(conditionsToUse),
  );
  console.log("[LCM-Editor] conditionsToUse length:", conditionsToUse.length);

  if (
    conditionsToUse &&
    Array.isArray(conditionsToUse) &&
    conditionsToUse.length > 0 &&
    conditionsContainer
  ) {
    console.log(
      `[LCM-Editor] ✅ Found ${conditionsToUse.length} conditions, populating:`,
      conditionsToUse,
    );
    conditionsToUse.forEach((conditionData) => {
      const condition = document.createElement("div");
      condition.className = "condition-block";

      const conditionType = conditionData.condition_type || "";
      const conditionValue =
        conditionData.condition_value || conditionData.value || "";
      const actionType =
        conditionData.action_type || conditionData.action?.type || "";

      condition.innerHTML = `
        <button type="button" class="remove-btn">&times;</button>
        <div class="form-group">
          <label>If</label>
          <select class="dialog-input condition-type">
            <option value="bank_balance_above" ${conditionType === "bank_balance_above" ? "selected" : ""}>Bank Balance Is Above</option>
            <option value="bank_balance_below" ${conditionType === "bank_balance_below" ? "selected" : ""}>Bank Balance Is Below</option>
            <option value="elapsed_time" ${conditionType === "elapsed_time" ? "selected" : ""}>Time in Lesson (Seconds)</option>
            <option value="quiz_score_below" ${conditionType === "quiz_score_below" ? "selected" : ""}>Quiz Score Is Below</option>
            <option value="quiz_score_above" ${conditionType === "quiz_score_above" ? "selected" : ""}>Quiz Score Is Above</option>
            <option value="account_switched" ${conditionType === "account_switched" ? "selected" : ""}>Account Switched</option>
          </select>
          <input type="number" class="dialog-input condition-value" placeholder="Value" style="max-width: 100px;" value="${conditionValue}">
        </div>
        <div class="form-group">
          <label>Then</label>
          <select class="dialog-input action-type">
            <option value="send_message" ${actionType === "send_message" ? "selected" : ""}>Send Message</option>
            <option value="add_text_block" ${actionType === "add_text_block" ? "selected" : ""}>Add Text Block</option>
            <option value="show_tip" ${actionType === "show_tip" ? "selected" : ""}>Show Tip</option>
            <option value="praise_good_habit" ${actionType === "praise_good_habit" ? "selected" : ""}>Praise Good Habit</option>
            <option value="suggest_action" ${actionType === "suggest_action" ? "selected" : ""}>Suggest Action</option>
            <option value="restart_student" ${actionType === "restart_student" ? "selected" : ""}>Restart Student</option>
            <option value="complete_lesson" ${actionType === "complete_lesson" ? "selected" : ""}>Complete Lesson</option>
          </select>
        </div>
        <div class="action-details"></div>
      `;
      conditionsContainer.appendChild(condition);

      // Add remove button listener
      const removeBtn = condition.querySelector(".remove-btn");
      if (removeBtn) {
        removeBtn.addEventListener("click", function () {
          condition.remove();
        });
      }

      // Populate action details based on action type
      const actionSelect = condition.querySelector(".action-type");
      const detailsContainer = condition.querySelector(".action-details");

      if (
        actionType === "send_message" ||
        actionType === "add_text_block" ||
        actionType === "show_tip"
      ) {
        let content = "";

        // Get content from various possible locations
        if (conditionData.action_details?.message) {
          content = conditionData.action_details.message;
        } else if (conditionData.action?.content) {
          content = conditionData.action.content;
        } else if (conditionData.action?.block?.content) {
          content = conditionData.action.block.content;
        }

        detailsContainer.innerHTML = `<textarea class="dialog-textarea action-content" placeholder="Enter content for action...">${content}</textarea>`;
      }

      // Add listener for action type changes
      if (actionSelect) {
        actionSelect.addEventListener("change", function () {
          const selectedAction = this.value;
          if (
            selectedAction === "send_message" ||
            selectedAction === "add_text_block" ||
            selectedAction === "show_tip"
          ) {
            detailsContainer.innerHTML = `<textarea class="dialog-textarea action-content" placeholder="Enter content for action..."></textarea>`;
          } else {
            detailsContainer.innerHTML = "";
          }
        });
      }
    });
  } else {
    console.log(
      "[LCM-Editor] ❌ No lesson_conditions or conditions found in lesson data",
    );
    console.log(
      "[LCM-Editor] All available fields in lesson:",
      Object.keys(lesson),
    );
  }

  console.log("[LCM-Editor] Lesson population complete");
}

// ============================================================================
// FETCH SINGLE LESSON BY ID
// ============================================================================

/**
 * Fetches a single lesson by ID from the server
 * @param {string} lessonId - The lesson's _id
 * @returns {Promise<Object>} The lesson object
 */
export async function fetchLessonById(lessonId) {
  try {
    console.log(`[LCM-Editor] Fetching lesson by ID: ${lessonId}`);

    const response = await fetch(
      `${API_CONFIG.lessonServer}/lesson/${lessonId}`,
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch lesson: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    if (!data.success || !data.lesson) {
      throw new Error("Lesson not found in response");
    }

    console.log("[LCM-Editor] Lesson fetched successfully:", data.lesson);
    return data.lesson;
  } catch (error) {
    console.error("[LCM-Editor] Error fetching lesson:", error);
    throw error;
  }
}

// ============================================================================
// UPDATE LESSON (OVERWRITE EXISTING)
// ============================================================================

/**
 * Updates an existing lesson (overwrites with new data)
 * Uses the same endpoint as creation (/api/lessons/create) but overwrites existing lesson
 * @param {string} lessonId - The lesson's _id to update
 * @param {Object} lessonData - New lesson data
 * @returns {Promise<Object>} Result object
 */
export async function updateLesson(lessonId, lessonData) {
  try {
    console.log("[LCM-Editor] Updating lesson:", lessonId);
    console.log("[LCM-Editor] New lesson data:", lessonData);

    // Prepare the complete lesson document (same structure as creation)
    const lessonDocument = {
      _id: parseInt(lessonId), // Keep the same ID to overwrite
      teacher: lessonData.teacher || window.activeTeacherName,
      unit: {
        value: lessonData.unitValue || lessonData.unit?.value,
        name: lessonData.unitName || lessonData.unit?.name,
      },
      lesson_title: lessonData.lesson_title,
      lesson_description: lessonData.lesson_description || "",

      // Content arrays
      content: lessonData.content || [],
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
      difficulty_level: lessonData.difficulty_level || null,
      estimated_duration: lessonData.estimated_duration || null,
      dallas_fed_aligned: lessonData.dallas_fed_aligned || null,
      condition_alignment: lessonData.condition_alignment || null,
      structure_cleaned: lessonData.structure_cleaned || null,

      // Update timestamp (keep original createdAt if available)
      updatedAt: new Date(),
    };

    // Prepare lesson reference for teacher's units array
    const lessonReference = {
      _id: lessonId.toString(),
      lesson_title: lessonData.lesson_title,
      lesson_description: lessonData.lesson_description || "",
    };

    // Build request payload
    const payload = {
      lesson: lessonDocument,
      lessonReference: lessonReference,
      isUpdate: true, // Flag to indicate this is an update operation
      lessonId: lessonId, // Explicit lesson ID for server to identify update
    };

    console.log("[LCM-Editor] Sending update request:", payload);

    // Send to server (uses same endpoint as creation)
    const response = await fetch(
      `${API_CONFIG.lessonServer}/api/lessons/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
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
      console.log("[LCM-Editor] ✅ Lesson updated successfully:", result);

      // Dispatch success event
      window.dispatchEvent(
        new CustomEvent("lcm:lessonUpdated", {
          detail: {
            lesson: lessonDocument,
            lessonId: lessonId,
            teacherName: lessonDocument.teacher,
            unitValue: lessonDocument.unit.value,
            timestamp: Date.now(),
          },
        }),
      );

      return {
        success: true,
        message: `Lesson "${lessonDocument.lesson_title}" updated successfully`,
        lesson: result.lesson || lessonDocument,
        lessonId: lessonId,
      };
    } else {
      throw new Error(result.message || "Failed to update lesson");
    }
  } catch (error) {
    console.error("[LCM-Editor] ❌ Error updating lesson:", error);

    // Dispatch error event
    window.dispatchEvent(
      new CustomEvent("lcm:lessonUpdateError", {
        detail: {
          error: error.message,
          lessonId,
          lessonData,
          timestamp: Date.now(),
        },
      }),
    );

    return {
      success: false,
      message: error.message || "Failed to update lesson",
    };
  }
}

// ============================================================================
// EVENT LISTENERS & INITIALIZATION
// ============================================================================

/**
 * Initializes the lesson editor listeners
 * Call this when the lesson creation/edit modal is displayed
 */
export function initializeLessonEditorListeners() {
  console.log("[LCM-Editor] Initializing lesson editor listeners");

  // Edit lesson selector change handler - enables/disables edit button
  const editLessonSelector = document.getElementById("editLessonSelector");
  if (editLessonSelector) {
    editLessonSelector.addEventListener("change", function () {
      const editLessonBtn = document.getElementById("editLessonBtn");
      if (editLessonBtn) {
        editLessonBtn.disabled = !this.value;
      }
    });
    console.log("[LCM-Editor] Edit lesson selector listener attached");
  }

  // Edit lesson button click handler - fetches lesson and populates form
  const editLessonBtn = document.getElementById("editLessonBtn");
  if (editLessonBtn) {
    editLessonBtn.addEventListener("click", async function () {
      const selectedLessonId =
        document.getElementById("editLessonSelector")?.value;

      if (!selectedLessonId) {
        alert("Please select a lesson to edit.");
        return;
      }

      try {
        console.log("[LCM-Editor] === LESSON EDITING DEBUG ===");
        console.log("[LCM-Editor] Selected lesson ID:", selectedLessonId);
        console.log("[LCM-Editor] Fetching lesson from server...");

        // Fetch the lesson by ID from the lesson server
        const lessonToEdit = await fetchLessonById(selectedLessonId);

        console.log("[LCM-Editor] Found lesson to edit:", lessonToEdit);
        console.log("[LCM-Editor] Lesson title:", lessonToEdit.lesson_title);
        console.log(
          "[LCM-Editor] Lesson description:",
          lessonToEdit.lesson_description,
        );
        console.log("[LCM-Editor] lesson_blocks:", lessonToEdit.lesson_blocks);
        console.log(
          "[LCM-Editor] intro_text_blocks:",
          lessonToEdit.intro_text_blocks,
        );
        console.log(
          "[LCM-Editor] lesson_conditions:",
          lessonToEdit.lesson_conditions,
        );

        // Store the lesson ID and original teacher for saving
        window.editingLessonId = selectedLessonId;
        window.editingLessonTeacher = lessonToEdit.teacher;

        // Update the save button text to indicate editing mode
        const saveLessonBtn = document.getElementById("saveLessonBtn");
        if (saveLessonBtn) {
          saveLessonBtn.textContent = "Update Lesson";
        }

        // Populate the lesson data into the form for editing
        populateLessonForEditing(lessonToEdit);

        // Show confirmation
        alert(
          `Lesson "${lessonToEdit.lesson_title}" loaded for editing. Make your changes and click "Update Lesson" to save.`,
        );
      } catch (error) {
        console.error("[LCM-Editor] Error loading lesson for editing:", error);
        alert("An error occurred while loading the lesson. Check the console.");
      }
    });
    console.log("[LCM-Editor] Edit lesson button listener attached");
  }
}

/**
 * Cleans up lesson editor listeners
 */
export function cleanupLessonEditorListeners() {
  console.log("[LCM-Editor] Cleaning up lesson editor listeners");

  // Reset editing state
  window.editingLessonId = null;
  window.editingLessonTeacher = null;

  // Reset save button text
  const saveLessonBtn = document.getElementById("saveLessonBtn");
  if (saveLessonBtn) {
    saveLessonBtn.textContent = "Save Lesson";
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  loadTeacherLessons,
  populateEditLessonSelector,
  populateLessonForEditing,
  fetchLessonById,
  updateLesson,
  initializeLessonEditorListeners,
  cleanupLessonEditorListeners,
};
