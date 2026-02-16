# Socket Integration Module (SIM) - Quick Start Guide

## 📦 What You Have

### Client-Side (Teacher Dashboard)

- **`LCME/SIM/adminOverrideSockets.js`** - WebSocket client for admin override features
- **`LCME/SIM/README.md`** - Complete documentation

### Server-Side (Lesson Server)

- **`LCME/SIM/adminOverrideSocketHandlers.js`** - Socket event handlers for server

---

## 🚀 Quick Integration (5 Steps)

### Step 1: Server Setup (Lesson Server)

In your `TrinCap Lessons local/server.js`, add socket handlers:

```javascript
// Near the top with other requires
const adminOverrideSocketHandlers = require("./LCME/SIM/adminOverrideSocketHandlers");

// Find your Socket.IO setup (should already exist)
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // ADD THIS LINE - Initialize admin override handlers
  adminOverrideSocketHandlers(socket, io);

  // ... rest of your existing socket handlers ...
});
```

That's it for the server! The handlers are now active.

---

### Step 2: Client Setup (Teacher Dashboard)

In your `TrinCapTeacher Dash/script.js`:

```javascript
// Add import at the top (you may already have this socket)
import {
  initializeAdminOverrideSockets,
  joinAdminOverrideRoom,
  leaveAdminOverrideRoom,
  emitCopyUnit,
} from "./LCME/SIM/adminOverrideSockets.js";

// Find where you create your lesson socket (around line 4000-4200)
// It should look something like:
const lessonSocket = io("http://localhost:4000");

// ADD THIS LINE right after creating the socket
initializeAdminOverrideSockets(lessonSocket);
```

---

### Step 3: Add Event Listeners (Teacher Dashboard)

Add these event listeners in `script.js` (put them after socket initialization):

```javascript
// Listen for unit copy completion
window.addEventListener("aom:unitCopyCompleted", (event) => {
  const { unitName, copiedLessonCount } = event.detail;
  console.log(`✅ Copied "${unitName}" with ${copiedLessonCount} lessons`);

  // Refresh the lesson management modal
  if (typeof loadTeacherLessons === "function") {
    loadTeacherLessons(window.activeTeacherName);
  }
});

// Listen for copy progress
window.addEventListener("aom:unitCopyProgress", (event) => {
  const { unitName, progress, currentLesson, totalLessons } = event.detail;
  console.log(
    `Copying ${unitName}: ${currentLesson}/${totalLessons} (${progress}%)`,
  );
});

// Listen for errors
window.addEventListener("aom:unitCopyError", (event) => {
  const { unitName, error } = event.detail;
  console.error(`Failed to copy ${unitName}:`, error);
});

// Listen for admin content updates
window.addEventListener("aom:adminUnitUpdated", (event) => {
  const { unitName } = event.detail;
  console.log(`📚 Admin updated "${unitName}" - refresh to see changes`);
});
```

---

### Step 4: Update Lesson Management Modal (Teacher Dashboard)

Find your lesson management modal code and add room join/leave:

```javascript
// In your lessonManagementBtn click handler (around line 3036)
document
  .getElementById("lessonManagementBtn")
  ?.addEventListener("click", function () {
    // Existing modal code...
    window.openGlobalDialog("Lesson Management", "");

    // ADD THIS - Join the admin override room
    joinAdminOverrideRoom(window.activeTeacherName);

    // ... rest of existing code ...
  });

// Find where you close the modal and add:
document
  .getElementById("closeGlobalDialog")
  ?.addEventListener("click", function () {
    // ADD THIS - Leave the room when closing
    leaveAdminOverrideRoom(window.activeTeacherName);

    // ... rest of existing close code ...
  });
```

---

### Step 5: Update Copy Unit Functions (Teacher Dashboard)

Replace your existing copy unit code to use sockets. Find the `handleCopyIndividualUnit` or similar function:

```javascript
// BEFORE (using fetch):
async function handleCopyIndividualUnit(unit) {
  const confirmed = confirm(`Copy "${unit.name}" to your account?`);
  if (!confirmed) return;

  try {
    const result = await copyAdminUnitToTeacher(window.activeTeacherName, unit);
    // ... handle result ...
  } catch (error) {
    // ... handle error ...
  }
}

// AFTER (using sockets):
async function handleCopyIndividualUnit(unit) {
  const confirmed = confirm(`Copy "${unit.name}" to your account?`);
  if (!confirmed) return;

  showLoadingSpinner("Copying unit...", `Preparing to copy "${unit.name}"`);

  // Use socket instead of fetch
  emitCopyUnit(window.activeTeacherName, unit, (response) => {
    if (response.success) {
      // Socket will emit unitCopyCompleted event
      // Your listener will handle the refresh
      console.log("Copy initiated successfully");
    } else {
      hideLoadingSpinner();
      alert(`Failed to copy: ${response.message}`);
    }
  });
}
```

---

## ✅ Testing Checklist

1. **Start servers:**
   - Lesson server (port 4000)
   - Teacher dashboard (port 5500)

2. **Open browser console**

3. **Sign in as teacher with empty units array**

4. **Check console logs:**

   ```
   [AOM-Sockets] Initializing admin override socket handlers
   [AOM-Sockets] Socket handlers initialized successfully
   ```

5. **Open Lesson Management modal**
   - Should see: `[AOM-Sockets] Joining admin override room for [teacher name]`

6. **Try copying a unit:**
   - Should see progress updates: `Copying X: 1/5 (20%)`
   - Should see completion: `✅ Copied "Unit Name" with 5 lessons`
   - Modal should refresh automatically

7. **Check server console:**
   ```
   [AOM-Sockets-Server] Client connected: [socket id]
   [AOM-Sockets-Server] Copy unit request: "Unit 1" to teacher@example.com
   [AOM-Sockets-Server] Copied lesson 1/5: "Lesson Title"
   [AOM-Sockets-Server] Successfully copied unit "Unit 1" to teacher@example.com
   ```

---

## 🎯 Benefits You Get

✅ **Real-time progress bars** during unit copying  
✅ **Instant notifications** when admin updates content  
✅ **Automatic modal refresh** after successful copy  
✅ **Better error handling** with detailed messages  
✅ **Multi-user support** - multiple teachers can work simultaneously  
✅ **Status tracking** - know when teacher transitions from viewing admin content to owning content

---

## 🐛 Troubleshooting

### "Socket not initialized" error

**Solution:** Make sure you called `initializeAdminOverrideSockets(lessonSocket)` after creating the socket

### Events not firing

**Solution:**

1. Check browser console for `[AOM-Sockets]` logs
2. Check server console for `[AOM-Sockets-Server]` logs
3. Verify servers are running

### Copy not working

**Solution:**

1. Check that MongoDB client is available in server handlers
2. Update the MongoDB access in `adminOverrideSocketHandlers.js` line 36:
   ```javascript
   const db = client.db("TrinityCapital"); // Use your actual client variable
   ```

### Room not joined

**Solution:** Make sure you're calling `joinAdminOverrideRoom()` when modal opens

---

## 📚 Next Steps

Once basic sockets work, you can enhance with:

1. **Progress bars in UI** - Use the `aom:unitCopyProgress` event to show visual progress
2. **Toast notifications** - Show real-time alerts for admin updates
3. **Copy all units** - Implement `emitCopyAllUnits()` for bulk copying
4. **Presence indicators** - Show which teachers are online
5. **More socket modules** - Create handlers for lesson creation, unit assignment, etc.

---

## 📞 Support

If you run into issues:

1. Check console logs (both client and server)
2. Review the full [README.md](./README.md) documentation
3. Verify MongoDB client is properly initialized in your server
4. Make sure Socket.IO versions match (client and server)

Happy coding! 🚀
