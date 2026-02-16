/**
 * LCME SIM - Unit Assignment Socket Module
 *
 * Handles socket communication between teacher dashboard and lesson server
 * for unit assignments to students.
 *
 * Responsibilities:
 * - Connect teacher dashboard to lesson server for unit assignments
 * - Send unit and lesson data to students via socket
 * - Save assignment data to server through socket communication
 */

class UnitAssignmentSocket {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.teacherName = null;
  }

  /**
   * Initialize socket connection to lesson server
   * @param {string} lessonServerUrl - The lesson server URL
   * @param {string} teacherName - The teacher's name for identification
   */
  initialize(lessonServerUrl, teacherName) {
    console.log(`🔄 [UnitAssignSocket] INIT: Starting initialization`);
    console.log(`🔄 [UnitAssignSocket] INIT: Server URL: ${lessonServerUrl}`);
    console.log(`🔄 [UnitAssignSocket] INIT: Teacher: ${teacherName}`);

    this.teacherName = teacherName;

    try {
      // Connect to lesson server
      console.log(`🔌 [UnitAssignSocket] INIT: Creating socket connection`);
      this.socket = io(lessonServerUrl, {
        withCredentials: true,
        transports: ["websocket", "polling"],
      });

      console.log(`🎯 [UnitAssignSocket] INIT: Setting up event handlers`);
      this.setupEventHandlers();

      console.log(
        `✅ [UnitAssignSocket] INIT: Initialization complete for ${lessonServerUrl} - Teacher: ${teacherName}`,
      );
    } catch (error) {
      console.error(
        `❌ [UnitAssignSocket] INIT: Failed to initialize socket:`,
        error,
      );
    }
  }

  /**
   * Set up socket event handlers
   */
  setupEventHandlers() {
    if (!this.socket) return;

    // Connection established
    this.socket.on("connect", () => {
      this.isConnected = true;
      console.log(
        `✅ [UnitAssignSocket] CONNECT: Successfully connected to lesson server`,
      );
      console.log(
        `📝 [UnitAssignSocket] CONNECT: Socket ID: ${this.socket.id}`,
      );

      // Identify teacher with server
      const identifyData = {
        teacherName: this.teacherName,
        purpose: "unitAssignment",
      };
      console.log(
        `💬 [UnitAssignSocket] CONNECT: Sending identifyTeacher with data:`,
        identifyData,
      );
      this.socket.emit("identifyTeacher", identifyData);
    });

    // Connection lost
    this.socket.on("disconnect", () => {
      this.isConnected = false;
      console.log("[UnitAssignmentSocket] Disconnected from lesson server");
    });

    // Teacher identification confirmed
    this.socket.on("teacherIdentified", (data) => {
      console.log(
        "[UnitAssignmentSocket] Teacher identification confirmed:",
        data,
      );
    });

    // Unit assignment confirmation from server
    this.socket.on("unitAssignmentSaved", (data) => {
      console.log(
        "[UnitAssignmentSocket] Unit assignment saved successfully:",
        data,
      );

      // Notify UI of successful save
      if (window.showNotification) {
        window.showNotification(
          `Unit "${data.unitName}" assignment saved successfully`,
          "success",
        );
      }
    });

    // Error handling
    this.socket.on("error", (error) => {
      console.error("[UnitAssignmentSocket] Socket error:", error);

      if (window.showNotification) {
        window.showNotification("Unit assignment connection error", "error");
      }
    });

    // Unit assignment error
    this.socket.on("unitAssignmentError", (error) => {
      console.error("[UnitAssignmentSocket] Unit assignment error:", error);

      if (window.showNotification) {
        window.showNotification(
          `Unit assignment failed: ${error.message}`,
          "error",
        );
      }
    });
  }

  /**
   * Send unit assignment data to lesson server for processing and storage
   * @param {Object} assignmentData - The unit assignment data
   * @returns {Promise<boolean>} - Success status
   */
  async sendUnitAssignment(assignmentData) {
    console.log(`🚀 [UnitAssignSocket] SEND: Starting to send unit assignment`);
    console.log(
      `🚀 [UnitAssignSocket] SEND: Connection status: ${this.isConnected}`,
    );
    console.log(`🚀 [UnitAssignSocket] SEND: Socket exists: ${!!this.socket}`);

    if (!this.isConnected || !this.socket) {
      console.error(
        `❌ [UnitAssignSocket] SEND: Not connected to lesson server`,
      );
      console.error(
        `❌ [UnitAssignSocket] SEND: Connected: ${this.isConnected}, Socket: ${!!this.socket}`,
      );
      return false;
    }

    try {
      console.log(
        `🚀 [UnitAssignSocket] SEND: Sending unit assignment:`,
        assignmentData,
      );

      const socketPayload = {
        teacherName: this.teacherName,
        assignmentData: assignmentData,
        timestamp: new Date().toISOString(),
      };

      console.log(`🚀 [UnitAssignSocket] SEND: Socket payload:`, socketPayload);

      // Emit unit assignment data to server
      console.log(
        `🚀 [UnitAssignSocket] SEND: Emitting 'assignUnitToStudents' event`,
      );
      this.socket.emit("assignUnitToStudents", socketPayload);

      console.log(
        `✅ [UnitAssignSocket] SEND: Unit assignment sent successfully`,
      );
      return true;
    } catch (error) {
      console.error(
        `❌ [UnitAssignSocket] SEND: Failed to send unit assignment:`,
        error,
      );
      return false;
    }
  }

  /**
   * Send lesson data to be saved on the server
   * @param {Object} lessonData - The lesson data to save
   * @param {Object} unitData - The unit this lesson belongs to
   * @returns {Promise<boolean>} - Success status
   */
  async saveLessonToServer(lessonData, unitData) {
    if (!this.isConnected || !this.socket) {
      console.error("[UnitAssignmentSocket] Not connected to lesson server");
      return false;
    }

    try {
      console.log(
        "[UnitAssignmentSocket] Saving lesson to server:",
        lessonData,
      );

      // Emit lesson save request to server
      this.socket.emit("saveLessonData", {
        teacherName: this.teacherName,
        lessonData: lessonData,
        unitData: unitData,
        timestamp: new Date().toISOString(),
      });

      return true;
    } catch (error) {
      console.error(
        "[UnitAssignmentSocket] Failed to save lesson data:",
        error,
      );
      return false;
    }
  }

  /**
   * Send unit data to be saved on the server
   * @param {Object} unitData - The unit data to save
   * @param {Array} lessonsData - Array of lessons in this unit
   * @returns {Promise<boolean>} - Success status
   */
  async saveUnitToServer(unitData, lessonsData = []) {
    if (!this.isConnected || !this.socket) {
      console.error("[UnitAssignmentSocket] Not connected to lesson server");
      return false;
    }

    try {
      console.log("[UnitAssignmentSocket] Saving unit to server:", unitData);

      // Emit unit save request to server
      this.socket.emit("saveUnitData", {
        teacherName: this.teacherName,
        unitData: unitData,
        lessonsData: lessonsData,
        timestamp: new Date().toISOString(),
      });

      return true;
    } catch (error) {
      console.error("[UnitAssignmentSocket] Failed to save unit data:", error);
      return false;
    }
  }

  /**
   * Request unit assignment status from server
   * @param {string} unitId - The unit ID to check
   * @returns {Promise<boolean>} - Success status
   */
  async requestAssignmentStatus(unitId) {
    if (!this.isConnected || !this.socket) {
      console.error("[UnitAssignmentSocket] Not connected to lesson server");
      return false;
    }

    try {
      this.socket.emit("getAssignmentStatus", {
        teacherName: this.teacherName,
        unitId: unitId,
      });

      return true;
    } catch (error) {
      console.error(
        "[UnitAssignmentSocket] Failed to request assignment status:",
        error,
      );
      return false;
    }
  }

  /**
   * Disconnect from lesson server
   */
  disconnect() {
    if (this.socket && this.isConnected) {
      console.log("[UnitAssignmentSocket] Disconnecting from lesson server");
      this.socket.disconnect();
      this.isConnected = false;
    }
  }

  /**
   * Check if socket is connected
   * @returns {boolean} - Connection status
   */
  isSocketConnected() {
    return this.isConnected && this.socket && this.socket.connected;
  }

  /**
   * Get current teacher name
   * @returns {string} - Teacher name
   */
  getTeacherName() {
    return this.teacherName;
  }

  /**
   * Emit a custom event to the lesson server
   * @param {string} eventName - Name of the event
   * @param {Object} data - Data to send
   * @returns {Promise<boolean>} - Success status
   */
  async emitCustomEvent(eventName, data) {
    if (!this.isConnected || !this.socket) {
      console.error("[UnitAssignmentSocket] Not connected to lesson server");
      return false;
    }

    try {
      this.socket.emit(eventName, {
        teacherName: this.teacherName,
        ...data,
      });

      return true;
    } catch (error) {
      console.error(
        `[UnitAssignmentSocket] Failed to emit ${eventName}:`,
        error,
      );
      return false;
    }
  }
}

// Create singleton instance
const unitAssignmentSocket = new UnitAssignmentSocket();

// Export for use in other modules
export default unitAssignmentSocket;

// Also export the class for potential multiple instances
export { UnitAssignmentSocket };

// Export initialization function for easy setup
export function initializeUnitAssignmentSocket(lessonServerUrl, teacherName) {
  unitAssignmentSocket.initialize(lessonServerUrl, teacherName);
  return unitAssignmentSocket;
}

// Export helper functions for common operations
export async function assignUnitViaSocket(assignmentData) {
  return await unitAssignmentSocket.sendUnitAssignment(assignmentData);
}

export async function saveLessonViaSocket(lessonData, unitData) {
  return await unitAssignmentSocket.saveLessonToServer(lessonData, unitData);
}

export async function saveUnitViaSocket(unitData, lessonsData) {
  return await unitAssignmentSocket.saveUnitToServer(unitData, lessonsData);
}
