/**
 * ============================================================================
 * ADMIN OVERRIDE SOCKETS MODULE
 * ============================================================================
 *
 * Purpose: Handles all Socket.IO events for the Admin Override Module (AOM)
 *
 * Socket Events:
 * - Copying units (client to server)
 * - Unit copy notifications (server to clients)
 * - Real-time admin unit updates
 * - Teacher content status changes
 *
 * @module AdminOverrideSockets
 */

// Socket.IO instance (will be set from main app)
let socket = null;

// Event listeners registry for cleanup
const eventListeners = new Map();

/**
 * Initializes the socket connection for admin override features
 * @param {Object} socketInstance - Socket.IO client instance
 */
export function initializeAdminOverrideSockets(socketInstance) {
  if (!socketInstance) {
    console.error("[AOM-Sockets] No socket instance provided");
    return;
  }

  socket = socketInstance;
  console.log("[AOM-Sockets] Initializing admin override socket handlers");

  // Register all socket event listeners
  registerSocketListeners();

  console.log("[AOM-Sockets] Socket handlers initialized successfully");
}

/**
 * Registers all socket event listeners for admin override
 */
function registerSocketListeners() {
  if (!socket) {
    console.error(
      "[AOM-Sockets] Cannot register listeners - socket not initialized",
    );
    return;
  }

  // Clean up existing listeners before registering new ones
  cleanupSocketListeners();

  // Listen for unit copy completion
  socket.on("unitCopyCompleted", handleUnitCopyCompleted);
  eventListeners.set("unitCopyCompleted", handleUnitCopyCompleted);

  // Listen for unit copy progress updates
  socket.on("unitCopyProgress", handleUnitCopyProgress);
  eventListeners.set("unitCopyProgress", handleUnitCopyProgress);

  // Listen for admin unit updates (when admin modifies content)
  socket.on("adminUnitUpdated", handleAdminUnitUpdated);
  eventListeners.set("adminUnitUpdated", handleAdminUnitUpdated);

  // Listen for unit copy errors
  socket.on("unitCopyError", handleUnitCopyError);
  eventListeners.set("unitCopyError", handleUnitCopyError);

  // Listen for teacher content status changes
  socket.on("teacherContentStatusChanged", handleTeacherContentStatusChanged);
  eventListeners.set(
    "teacherContentStatusChanged",
    handleTeacherContentStatusChanged,
  );

  console.log(
    "[AOM-Sockets] Registered",
    eventListeners.size,
    "socket event listeners",
  );
}

/**
 * Cleans up all socket event listeners
 */
function cleanupSocketListeners() {
  if (!socket) return;

  eventListeners.forEach((handler, eventName) => {
    socket.off(eventName, handler);
  });

  eventListeners.clear();
  console.log("[AOM-Sockets] Cleaned up socket event listeners");
}

// ============================================================================
// CLIENT-TO-SERVER EMITTERS
// ============================================================================

/**
 * Emits request to copy a unit from admin to teacher
 * @param {string} teacherName - Teacher receiving the unit
 * @param {Object} unit - Unit object to copy
 * @param {Function} callback - Callback with result
 */
export function emitCopyUnit(teacherName, unit, callback) {
  if (!socket) {
    console.error("[AOM-Sockets] Socket not initialized");
    if (callback)
      callback({ success: false, message: "Socket not initialized" });
    return;
  }

  console.log(
    `[AOM-Sockets] Emitting copyUnit request for "${unit.name}" to ${teacherName}`,
  );

  socket.emit(
    "copyAdminUnit",
    {
      teacherName,
      unit: {
        value: unit.value,
        name: unit.name,
        lessons: unit.lessons.map((lesson) => ({
          _id: lesson._id,
          lesson_title: lesson.lesson_title,
          lesson_description: lesson.lesson_description,
        })),
      },
      timestamp: Date.now(),
    },
    (response) => {
      console.log("[AOM-Sockets] Copy unit response:", response);
      if (callback) callback(response);
    },
  );
}

/**
 * Emits request to copy all admin units to teacher
 * @param {string} teacherName - Teacher receiving the units
 * @param {Function} callback - Callback with result
 */
export function emitCopyAllUnits(teacherName, callback) {
  if (!socket) {
    console.error("[AOM-Sockets] Socket not initialized");
    if (callback)
      callback({ success: false, message: "Socket not initialized" });
    return;
  }

  console.log(`[AOM-Sockets] Emitting copyAllUnits request for ${teacherName}`);

  socket.emit(
    "copyAllAdminUnits",
    {
      teacherName,
      timestamp: Date.now(),
    },
    (response) => {
      console.log("[AOM-Sockets] Copy all units response:", response);
      if (callback) callback(response);
    },
  );
}

/**
 * Joins the admin override room for real-time updates
 * @param {string} teacherName - Teacher name
 */
export function joinAdminOverrideRoom(teacherName) {
  if (!socket) {
    console.error("[AOM-Sockets] Socket not initialized");
    return;
  }

  console.log(`[AOM-Sockets] Joining admin override room for ${teacherName}`);

  socket.emit("joinAdminOverrideRoom", { teacherName });
}

/**
 * Leaves the admin override room
 * @param {string} teacherName - Teacher name
 */
export function leaveAdminOverrideRoom(teacherName) {
  if (!socket) {
    console.error("[AOM-Sockets] Socket not initialized");
    return;
  }

  console.log(`[AOM-Sockets] Leaving admin override room for ${teacherName}`);

  socket.emit("leaveAdminOverrideRoom", { teacherName });
}

/**
 * Notifies server that teacher is viewing admin content
 * @param {string} teacherName - Teacher name
 * @param {string} unitValue - Unit being viewed
 */
export function emitViewingAdminContent(teacherName, unitValue) {
  if (!socket) return;

  socket.emit("viewingAdminContent", {
    teacherName,
    unitValue,
    timestamp: Date.now(),
  });
}

// ============================================================================
// SERVER-TO-CLIENT HANDLERS
// ============================================================================

/**
 * Handles unit copy completion notification
 * @param {Object} data - { teacherName, unitName, unitValue, success }
 */
function handleUnitCopyCompleted(data) {
  console.log("[AOM-Sockets] Unit copy completed:", data);

  const { teacherName, unitName, unitValue, success, copiedLessonCount } = data;

  // Dispatch custom event for UI to handle
  window.dispatchEvent(
    new CustomEvent("aom:unitCopyCompleted", {
      detail: {
        teacherName,
        unitName,
        unitValue,
        success,
        copiedLessonCount,
        timestamp: Date.now(),
      },
    }),
  );

  // Show notification
  if (success) {
    const message = `✅ Unit "${unitName}" copied successfully! (${copiedLessonCount} lessons)`;
    if (window.showNotification) {
      window.showNotification(message, "success", 5000);
    } else {
      console.log(message);
    }
  }
}

/**
 * Handles unit copy progress updates
 * @param {Object} data - { teacherName, unitName, progress, currentLesson, totalLessons }
 */
function handleUnitCopyProgress(data) {
  console.log("[AOM-Sockets] Unit copy progress:", data);

  const { teacherName, unitName, progress, currentLesson, totalLessons } = data;

  // Dispatch custom event for UI to handle (progress bars, etc.)
  window.dispatchEvent(
    new CustomEvent("aom:unitCopyProgress", {
      detail: {
        teacherName,
        unitName,
        progress, // 0-100
        currentLesson,
        totalLessons,
        timestamp: Date.now(),
      },
    }),
  );

  // Update loading overlay if present
  if (window.loadingOverlay) {
    const loadingText = document.querySelector(".loading-text");
    const loadingSubtext = document.querySelector(".loading-subtext");

    if (loadingText) {
      loadingText.textContent = `Copying "${unitName}"...`;
    }
    if (loadingSubtext) {
      loadingSubtext.textContent = `Lesson ${currentLesson} of ${totalLessons} (${progress}%)`;
    }
  }
}

/**
 * Handles admin unit update notifications
 * @param {Object} data - { unitValue, unitName, updatedBy, changes }
 */
function handleAdminUnitUpdated(data) {
  console.log("[AOM-Sockets] Admin unit updated:", data);

  const { unitValue, unitName, updatedBy, changes } = data;

  // Dispatch custom event
  window.dispatchEvent(
    new CustomEvent("aom:adminUnitUpdated", {
      detail: {
        unitValue,
        unitName,
        updatedBy,
        changes,
        timestamp: Date.now(),
      },
    }),
  );

  // If teacher is viewing admin content, show notification
  if (window.contentType === "default" || window.isUsingMasterDefaults) {
    const message = `📚 Admin updated "${unitName}". Refresh to see latest version.`;
    if (window.showNotification) {
      window.showNotification(message, "info", 5000);
    }
  }
}

/**
 * Handles unit copy errors
 * @param {Object} data - { teacherName, unitName, error }
 */
function handleUnitCopyError(data) {
  console.error("[AOM-Sockets] Unit copy error:", data);

  const { teacherName, unitName, error } = data;

  // Dispatch custom event
  window.dispatchEvent(
    new CustomEvent("aom:unitCopyError", {
      detail: {
        teacherName,
        unitName,
        error,
        timestamp: Date.now(),
      },
    }),
  );

  // Show error notification
  const message = `❌ Failed to copy "${unitName}": ${error}`;
  if (window.showNotification) {
    window.showNotification(message, "error", 7000);
  } else {
    alert(message);
  }
}

/**
 * Handles teacher content status changes
 * @param {Object} data - { teacherName, hadContent, hasContent, action }
 */
function handleTeacherContentStatusChanged(data) {
  console.log("[AOM-Sockets] Teacher content status changed:", data);

  const { teacherName, hadContent, hasContent, action } = data;

  // Only handle if this is the current teacher
  if (window.activeTeacherName === teacherName) {
    // Dispatch custom event
    window.dispatchEvent(
      new CustomEvent("aom:contentStatusChanged", {
        detail: {
          teacherName,
          hadContent,
          hasContent,
          action, // 'created', 'copied', 'deleted'
          timestamp: Date.now(),
        },
      }),
    );

    // If teacher went from no content to having content, refresh
    if (!hadContent && hasContent) {
      const message = `🎉 You now have your own content! Refreshing...`;
      if (window.showNotification) {
        window.showNotification(message, "success", 3000);
      }

      // Reload teacher lessons after short delay
      setTimeout(() => {
        if (window.loadTeacherLessons) {
          window.loadTeacherLessons(teacherName);
        }
      }, 2000);
    }
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Checks if socket is connected
 * @returns {boolean}
 */
export function isSocketConnected() {
  return socket && socket.connected;
}

/**
 * Gets socket connection status
 * @returns {Object} - { connected, id, transport }
 */
export function getSocketStatus() {
  if (!socket) {
    return { connected: false, id: null, transport: null };
  }

  return {
    connected: socket.connected,
    id: socket.id,
    transport: socket.io?.engine?.transport?.name || "unknown",
  };
}

/**
 * Manually reconnects socket if disconnected
 */
export function reconnectSocket() {
  if (!socket) {
    console.error("[AOM-Sockets] No socket instance to reconnect");
    return;
  }

  if (!socket.connected) {
    console.log("[AOM-Sockets] Attempting to reconnect...");
    socket.connect();
  } else {
    console.log("[AOM-Sockets] Socket already connected");
  }
}

/**
 * Destroys the socket connection and cleans up listeners
 */
export function destroyAdminOverrideSockets() {
  console.log("[AOM-Sockets] Destroying admin override sockets");

  cleanupSocketListeners();

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  console.log("[AOM-Sockets] Sockets destroyed");
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initializeAdminOverrideSockets,
  emitCopyUnit,
  emitCopyAllUnits,
  joinAdminOverrideRoom,
  leaveAdminOverrideRoom,
  emitViewingAdminContent,
  isSocketConnected,
  getSocketStatus,
  reconnectSocket,
  destroyAdminOverrideSockets,
};
