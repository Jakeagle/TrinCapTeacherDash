# Socket Integration Module (SIM)

## Overview

The **Socket Integration Module (SIM)** handles all WebSocket communications for the Lesson Creation and Management Engine (LCME). It provides real-time, bidirectional communication between the teacher dashboard and the lesson server.

## Architecture

```
LCME/
└── SIM/
    ├── README.md                    (this file)
    ├── adminOverrideSockets.js      (Client-side: Admin Override WebSockets)
    └── [future modules]             (Additional socket handlers for other LCME features)
```

## Purpose

- **Real-time Updates**: Push notifications when content changes
- **Progress Tracking**: Live updates during long operations (copying units, etc.)
- **Multi-user Sync**: Coordinate updates when multiple teachers are active
- **Error Handling**: Immediate feedback for failed operations

---

## Admin Override Sockets (`adminOverrideSockets.js`)

### Features

1. **Unit Copying**: Real-time progress and completion notifications
2. **Content Updates**: Alert teachers when admin updates shared content
3. **Status Changes**: Notify when teacher transitions from viewing admin content to owning content
4. **Room Management**: Join/leave rooms for targeted notifications

### Client-Side Usage

#### 1. Initialize Socket Connection

```javascript
import { initializeAdminOverrideSockets } from "./LCME/SIM/adminOverrideSockets.js";

// Get your Socket.IO instance (e.g., from script.js)
const socket = io("http://localhost:4000");

// Initialize the admin override socket handlers
initializeAdminOverrideSockets(socket);
```

#### 2. Copy a Unit

```javascript
import { emitCopyUnit } from "./LCME/SIM/adminOverrideSockets.js";

emitCopyUnit("teacher@example.com", unitObject, (response) => {
  if (response.success) {
    console.log("Unit copied!", response);
  } else {
    console.error("Copy failed:", response.message);
  }
});
```

#### 3. Join Admin Override Room (for real-time updates)

```javascript
import { joinAdminOverrideRoom } from "./LCME/SIM/adminOverrideSockets.js";

// Join when opening lesson management modal
joinAdminOverrideRoom("teacher@example.com");

// Leave when closing modal
leaveAdminOverrideRoom("teacher@example.com");
```

#### 4. Listen to Custom Events

The module dispatches custom events that you can listen to:

```javascript
// Listen for unit copy completion
window.addEventListener("aom:unitCopyCompleted", (event) => {
  const { unitName, success, copiedLessonCount } = event.detail;
  console.log(`${unitName} copied with ${copiedLessonCount} lessons`);

  // Refresh your UI
  refreshLessonManagementModal();
});

// Listen for copy progress
window.addEventListener("aom:unitCopyProgress", (event) => {
  const { unitName, progress, currentLesson, totalLessons } = event.detail;
  updateProgressBar(progress);
});

// Listen for admin unit updates
window.addEventListener("aom:adminUnitUpdated", (event) => {
  const { unitName, changes } = event.detail;
  showUpdateNotification(`Admin updated "${unitName}"`);
});

// Listen for content status changes
window.addEventListener("aom:contentStatusChanged", (event) => {
  const { hadContent, hasContent, action } = event.detail;
  if (action === "copied") {
    // Teacher just copied their first unit!
    celebrateFirstUnit();
  }
});

// Listen for errors
window.addEventListener("aom:unitCopyError", (event) => {
  const { unitName, error } = event.detail;
  showErrorMessage(`Failed to copy ${unitName}: ${error}`);
});
```

### Server-Side Implementation

The server-side handlers should be implemented in the lesson server (`server.js`). See the server-side implementation guide below.

---

## Server-Side Socket Handlers

Add these handlers to your lesson server (port 4000):

### Setup

```javascript
// In your server.js
const io = require("socket.io")(server, {
  cors: {
    origin: "http://localhost:5500", // Your dashboard URL
    methods: ["GET", "POST"],
  },
});

// Admin Override Socket Handlers
io.on("connection", (socket) => {
  console.log("[AOM-Sockets] Client connected:", socket.id);

  // Import the handlers
  require("./LCME/SIM/adminOverrideSocketHandlers")(socket, io);

  socket.on("disconnect", () => {
    console.log("[AOM-Sockets] Client disconnected:", socket.id);
  });
});
```

### Required Server-Side Events

The server must handle these events:

1. **`copyAdminUnit`** - Copy a single unit from admin to teacher
2. **`copyAllAdminUnits`** - Copy all admin units to teacher
3. **`joinAdminOverrideRoom`** - Join room for real-time updates
4. **`leaveAdminOverrideRoom`** - Leave the room
5. **`viewingAdminContent`** - Track who's viewing admin content

And emit these events to clients:

1. **`unitCopyCompleted`** - When copy finishes
2. **`unitCopyProgress`** - During copy operation
3. **`adminUnitUpdated`** - When admin modifies content
4. **`unitCopyError`** - If copy fails
5. **`teacherContentStatusChanged`** - When teacher goes from no content to having content

---

## Integration Checklist

### Client-Side (Teacher Dashboard)

- [ ] Import and initialize `adminOverrideSockets.js` with Socket.IO instance
- [ ] Call `joinAdminOverrideRoom()` when opening lesson management modal
- [ ] Call `leaveAdminOverrideRoom()` when closing modal
- [ ] Use `emitCopyUnit()` instead of direct API calls for copying
- [ ] Add event listeners for `aom:*` custom events
- [ ] Update UI based on real-time notifications

### Server-Side (Lesson Server)

- [ ] Create socket handlers for all client events
- [ ] Implement room management (join/leave)
- [ ] Emit progress updates during long operations
- [ ] Broadcast admin updates to relevant rooms
- [ ] Handle errors and emit error events
- [ ] Track teacher content status and notify on changes

---

## API Reference

### Client-Side Functions

| Function                                 | Parameters                          | Returns   | Description                |
| ---------------------------------------- | ----------------------------------- | --------- | -------------------------- |
| `initializeAdminOverrideSockets(socket)` | `socket` - Socket.IO instance       | `void`    | Initialize socket handlers |
| `emitCopyUnit(teacher, unit, callback)`  | Teacher name, unit object, callback | `void`    | Request unit copy          |
| `emitCopyAllUnits(teacher, callback)`    | Teacher name, callback              | `void`    | Copy all admin units       |
| `joinAdminOverrideRoom(teacher)`         | Teacher name                        | `void`    | Join room for updates      |
| `leaveAdminOverrideRoom(teacher)`        | Teacher name                        | `void`    | Leave room                 |
| `emitViewingAdminContent(teacher, unit)` | Teacher name, unit value            | `void`    | Track viewing              |
| `isSocketConnected()`                    | None                                | `boolean` | Check connection           |
| `getSocketStatus()`                      | None                                | `Object`  | Get connection details     |
| `reconnectSocket()`                      | None                                | `void`    | Manual reconnect           |
| `destroyAdminOverrideSockets()`          | None                                | `void`    | Cleanup and disconnect     |

### Custom Events

| Event Name                 | Detail Properties                                              | Description                    |
| -------------------------- | -------------------------------------------------------------- | ------------------------------ |
| `aom:unitCopyCompleted`    | `teacherName, unitName, unitValue, success, copiedLessonCount` | Unit copy finished             |
| `aom:unitCopyProgress`     | `teacherName, unitName, progress, currentLesson, totalLessons` | Copy progress update           |
| `aom:adminUnitUpdated`     | `unitValue, unitName, updatedBy, changes`                      | Admin modified content         |
| `aom:unitCopyError`        | `teacherName, unitName, error`                                 | Copy operation failed          |
| `aom:contentStatusChanged` | `teacherName, hadContent, hasContent, action`                  | Teacher content status changed |

---

## Example: Complete Integration

```javascript
// script.js

import {
  initializeAdminOverrideSockets,
  joinAdminOverrideRoom,
  leaveAdminOverrideRoom,
  emitCopyUnit,
} from "./LCME/SIM/adminOverrideSockets.js";

// 1. Initialize socket connection
const lessonSocket = io("http://localhost:4000");

// 2. Initialize AOM sockets
initializeAdminOverrideSockets(lessonSocket);

// 3. Set up event listeners
window.addEventListener("aom:unitCopyCompleted", handleUnitCopyCompleted);
window.addEventListener("aom:unitCopyProgress", handleCopyProgress);
window.addEventListener("aom:unitCopyError", handleCopyError);

// 4. Open lesson management modal
function openLessonManagementModal() {
  // Join room for real-time updates
  joinAdminOverrideRoom(window.activeTeacherName);

  // Show modal...
}

// 5. Copy unit button handler
function handleCopyUnitClick(unit) {
  showLoadingSpinner("Copying unit...");

  emitCopyUnit(window.activeTeacherName, unit, (response) => {
    if (response.success) {
      console.log("Unit copied successfully!");
    } else {
      alert("Copy failed: " + response.message);
    }
    hideLoadingSpinner();
  });
}

// 6. Handle copy completion
function handleUnitCopyCompleted(event) {
  const { unitName, copiedLessonCount } = event.detail;
  showNotification(
    `✅ Copied "${unitName}" (${copiedLessonCount} lessons)`,
    "success",
  );

  // Refresh the modal to show teacher's own content now
  refreshLessonManagementModal();
}

// 7. Close modal
function closeLessonManagementModal() {
  // Leave room
  leaveAdminOverrideRoom(window.activeTeacherName);

  // Close modal...
}
```

---

## Benefits

✅ **Real-time**: Instant feedback without polling  
✅ **Efficient**: Only sends data when changes occur  
✅ **Scalable**: Room-based broadcasts target specific teachers  
✅ **User-friendly**: Progress bars and live notifications  
✅ **Reliable**: Error handling and reconnection logic  
✅ **Modular**: Clean separation of concerns

---

## Future Enhancements

- [ ] Add socket handlers for lesson creation
- [ ] Add socket handlers for unit assignment
- [ ] Implement collaborative editing notifications
- [ ] Add presence indicators (who's online)
- [ ] Add typing indicators for lesson editing
- [ ] Implement conflict resolution for concurrent edits

---

## Troubleshooting

### Socket won't connect

- Check that lesson server is running on port 4000
- Verify CORS settings in server
- Check browser console for errors

### Events not firing

- Ensure `initializeAdminOverrideSockets()` was called
- Check that socket is connected: `isSocketConnected()`
- Verify server-side handlers are implemented

### Duplicate events

- Make sure you're not initializing multiple times
- Call `destroyAdminOverrideSockets()` before re-initializing

---

## Support

For issues or questions about the SIM:

1. Check the console for `[AOM-Sockets]` logs
2. Use `getSocketStatus()` to check connection
3. Review server-side logs for matching events
