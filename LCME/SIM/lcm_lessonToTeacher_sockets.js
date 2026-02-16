/**
 * ==========================================
 * LCM Lesson-to-Teacher Socket Integration
 * ==========================================
 *
 * Purpose:
 * Real-time UI updates for lesson and unit management.
 * Listens for socket events from the Lesson server and updates
 * dropdowns and displays across the teacher dashboard.
 *
 * Socket Events Handled:
 * - unitCreated: New unit created by teacher
 * - lessonCreated: New lesson saved to Lessons collection
 * - lessonUpdated: Existing lesson modified
 *
 * UI Functions Updated:
 * - populateUnitSelector() - Lesson creation unit dropdown (LCME)
 * - populateEditLessonSelector() - Edit lesson dropdown (LCME)
 * - populateUnitSelectorForAssignmentDisplay() - Assignment unit dropdown (Lesson Management Modal)
 * - populateMasterLessonSelect() - All available lessons dropdown (Lesson Management Modal)
 *
 * Dependencies:
 * - lessonSocket: Socket.IO connection to lesson server (port 4000)
 * - Global functions: populateUnitSelector, populateEditLessonSelector, etc.
 * - Global state: window.activeTeacherName, window.teacherUnits, window.allTeacherLessons
 */

// Socket instance (will be injected during initialization)
let lessonSocket = null;

/**
 * Initialize the LCM socket integration
 * @param {Socket} socketInstance - The lesson socket.io instance
 */
export function initializeLCMSockets(socketInstance) {
  lessonSocket = socketInstance;
  console.log("[LCM Sockets] Initializing real-time lesson/unit updates...");

  registerSocketListeners();
}

/**
 * Register all socket event listeners
 */
function registerSocketListeners() {
  if (!lessonSocket) {
    console.error(
      "[LCM Sockets] Cannot register listeners: socket not initialized",
    );
    return;
  }

  // Listen for new unit creation
  lessonSocket.on("unitCreated", handleUnitCreated);

  // Listen for new lesson creation
  lessonSocket.on("lessonCreated", handleLessonCreated);

  // Listen for lesson updates
  lessonSocket.on("lessonUpdated", handleLessonUpdated);

  console.log("[LCM Sockets] Socket listeners registered successfully");
}

/**
 * Handle unitCreated event
 * Triggered when a teacher creates a new unit
 *
 * @param {Object} data - Event payload
 * @param {string} data.teacherName - Name of teacher who created the unit
 * @param {Object} data.unit - Full unit object with value, name, lessons, etc.
 */
function handleUnitCreated(data) {
  console.log("[LCM Sockets] Unit created:", data);

  const { teacherName, unit } = data;

  // Only process if this is for the current teacher
  if (teacherName !== window.activeTeacherName) {
    console.log(
      "[LCM Sockets] Ignoring unitCreated event for different teacher",
    );
    return;
  }

  // Extract unit details
  const unitValue = unit.value; // e.g., "unit5"
  const unitName = unit.name; // e.g., "Financial Planning"
  const unitNumber = parseInt(unitValue.replace("unit", ""), 10); // Extract number from "unit5"

  // Update global teacherUnits array if not already present
  if (window.teacherUnits && Array.isArray(window.teacherUnits)) {
    const existingUnit = window.teacherUnits.find((u) => u.value === unitValue);
    if (!existingUnit) {
      window.teacherUnits.push({
        value: unitValue,
        name: unitName,
        number: unitNumber,
        unitName: unitName,
        lessons: unit.lessons || [],
      });
      console.log("[LCM Sockets] Added new unit to teacherUnits:", unitValue);
    }
  }

  // Update global teacherOwnUnits array if not already present
  if (window.teacherOwnUnits && Array.isArray(window.teacherOwnUnits)) {
    const existingOwnUnit = window.teacherOwnUnits.find(
      (u) => u.value === unitValue,
    );
    if (!existingOwnUnit) {
      window.teacherOwnUnits.push({
        value: unitValue,
        name: unitName,
        number: unitNumber,
        unitName: unitName,
        lessons: unit.lessons || [],
      });
      console.log(
        "[LCM Sockets] Added new unit to teacherOwnUnits:",
        unitValue,
      );
    }
  }

  // Update UI: Lesson creation unit dropdown (LCME)
  if (typeof window.populateUnitSelector === "function") {
    window.populateUnitSelector();
    console.log("[LCM Sockets] Updated lesson creation unit selector");
  }

  // Update UI: Assignment unit dropdown (Lesson Management Modal)
  const unitSelectorForAssignment = document.getElementById(
    "unitSelectorForAssignment",
  );
  if (
    unitSelectorForAssignment &&
    typeof window.populateUnitSelectorForAssignmentDisplay === "function"
  ) {
    window.populateUnitSelectorForAssignmentDisplay(unitSelectorForAssignment);
    console.log("[LCM Sockets] Updated assignment unit selector");
  }

  // Show success notification
  showNotification(`New unit "${unitName}" created successfully!`, "success");
}

/**
 * Handle lessonCreated event
 * Triggered when a teacher creates a new lesson
 *
 * @param {Object} data - Event payload
 * @param {string} data.teacherName - Name of teacher who created the lesson
 * @param {string} data.unitValue - Unit the lesson belongs to
 * @param {Object} data.lessonRef - Lesson reference object with name and id
 */
function handleLessonCreated(data) {
  console.log("[LCM Sockets] Lesson created:", data);

  const { teacherName, unitValue, lesson: lessonRef } = data;

  // Only process if this is for the current teacher
  if (teacherName !== window.activeTeacherName) {
    console.log(
      "[LCM Sockets] Ignoring lessonCreated event for different teacher",
    );
    return;
  }

  // Update the unit's lessons array in teacherUnits
  if (window.teacherUnits && Array.isArray(window.teacherUnits)) {
    const unit = window.teacherUnits.find((u) => u.value === unitValue);
    if (unit) {
      if (!unit.lessons) unit.lessons = [];
      const existingLesson = unit.lessons.find(
        (l) => l.name === lessonRef.name,
      );
      if (!existingLesson) {
        unit.lessons.push(lessonRef);
        console.log("[LCM Sockets] Added lesson to unit:", lessonRef.name);
      }
    }
  }

  // Reload all teacher lessons from server for accurate data
  if (typeof window.loadTeacherLessons === "function") {
    window.loadTeacherLessons(teacherName);
    console.log("[LCM Sockets] Reloaded teacher lessons from server");
  }

  // Update UI: Edit lesson dropdown (LCME)
  if (typeof window.populateEditLessonSelector === "function") {
    window.populateEditLessonSelector();
    console.log("[LCM Sockets] Updated edit lesson selector");
  }

  // Update UI: All available lessons dropdown (Lesson Management Modal)
  if (typeof window.populateMasterLessonSelect === "function") {
    window.populateMasterLessonSelect();
    console.log("[LCM Sockets] Updated master lesson selector");
  }

  // Show success notification
  showNotification(
    `Lesson "${lessonRef.name}" created successfully!`,
    "success",
  );
}

/**
 * Handle lessonUpdated event
 * Triggered when a teacher updates an existing lesson
 *
 * @param {Object} data - Event payload
 * @param {string} data.teacherName - Name of teacher who updated the lesson
 * @param {string} data.unitValue - Unit the lesson belongs to
 * @param {Object} data.lessonRef - Updated lesson reference object
 */
function handleLessonUpdated(data) {
  console.log("[LCM Sockets] Lesson updated:", data);

  const { teacherName, unitValue, lesson: lessonRef } = data;

  // Only process if this is for the current teacher
  if (teacherName !== window.activeTeacherName) {
    console.log(
      "[LCM Sockets] Ignoring lessonUpdated event for different teacher",
    );
    return;
  }

  // Update the lesson in the unit's lessons array
  if (window.teacherUnits && Array.isArray(window.teacherUnits)) {
    const unit = window.teacherUnits.find((u) => u.value === unitValue);
    if (unit && unit.lessons) {
      const lessonIndex = unit.lessons.findIndex((l) => l.id === lessonRef.id);
      if (lessonIndex !== -1) {
        unit.lessons[lessonIndex] = lessonRef;
        console.log("[LCM Sockets] Updated lesson in unit:", lessonRef.name);
      }
    }
  }

  // Reload all teacher lessons from server for accurate data
  if (typeof window.loadTeacherLessons === "function") {
    window.loadTeacherLessons(teacherName);
    console.log("[LCM Sockets] Reloaded teacher lessons from server");
  }

  // Update UI: Edit lesson dropdown (LCME)
  if (typeof window.populateEditLessonSelector === "function") {
    window.populateEditLessonSelector();
    console.log("[LCM Sockets] Updated edit lesson selector");
  }

  // Update UI: All available lessons dropdown (Lesson Management Modal)
  if (typeof window.populateMasterLessonSelect === "function") {
    window.populateMasterLessonSelect();
    console.log("[LCM Sockets] Updated master lesson selector");
  }

  // Show success notification
  showNotification(
    `Lesson "${lessonRef.name}" updated successfully!`,
    "success",
  );
}

/**
 * Show notification to user
 * @param {string} message - Notification message
 * @param {string} type - Notification type ('success', 'error', 'info')
 */
function showNotification(message, type = "info") {
  // Use the global showNotification function if available
  if (typeof window.showNotification === "function") {
    window.showNotification(message, type);
  } else {
    // Fallback to console if global function not available
    console.log(`[LCM Sockets] ${type.toUpperCase()}: ${message}`);
  }
}

/**
 * Cleanup socket listeners
 * Call this when the module needs to be destroyed
 */
export function cleanup() {
  if (!lessonSocket) return;

  lessonSocket.off("unitCreated", handleUnitCreated);
  lessonSocket.off("lessonCreated", handleLessonCreated);
  lessonSocket.off("lessonUpdated", handleLessonUpdated);

  console.log("[LCM Sockets] Cleaned up socket listeners");
}

console.log("[LCM Sockets] Module loaded and ready for initialization");
