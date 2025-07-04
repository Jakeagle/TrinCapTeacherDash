// Get sign-on dialog from the DOM
const signOnDialog = document.getElementById("signOnDialog");
const messagesDialog = document.getElementById("messagesDialog");
// This will be the new central data store for all message threads
window.messageThreads = new Map();

// Helper to hash PIN using SHA-256
async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// New function to centralize all message sending
function sendMessage(senderId, recipientId, messageContent) {
  // MODIFIED: Added return threadId
  if (!senderId || !recipientId || !messageContent) {
    console.error("sendMessage failed: Missing sender, recipient, or message.");
    return;
  }

  const payload = {
    senderId,
    recipientId,
    messageContent,
  };
  socket.emit("sendMessage", payload);

  // --- OPTIMISTIC UPDATE ---
  // Determine the threadId for the frontend's internal Map.
  // recipientId here is the *actual* recipient (student name or class-message-teachername)
  const isClassMsg = recipientId.startsWith("class-message-");
  let threadId;

  if (isClassMsg) {
    threadId = `class-message-${window.activeTeacherName}`; // Consistent with backend
  } else {
    const sortedParticipants = [senderId, recipientId].sort(); // This correctly forms the canonical threadId
    threadId = sortedParticipants.join("_");
    // Note: recipientId in payload is the student's name, not the combined threadId
  }

  if (!window.messageThreads.has(threadId)) {
    console.log(`Optimistically creating new thread for ${threadId}`);
    window.messageThreads.set(threadId, {
      threadId: threadId,
      type: isClassMsg ? "class" : "private",
      // For new private threads, participants should be the sorted pair
      participants: isClassMsg
        ? [senderId, "class-message-recipient"]
        : sortedParticipants,
      messages: [], // Actual messages will be pushed by 'newMessage' handler
      lastMessageTimestamp: new Date().toISOString(), // Use lastMessageTimestamp for consistency
      hasUnread: false,
    });
  }
  return threadId; // MODIFIED: Return the calculated threadId
}

// Fetches all messages for the teacher and processes them into threads.
// This is called once after login.
async function initializeMessaging(teacherUsername) {
  // Note: The `teacherUsername` parameter is now the teacher's full name.
  // The server endpoint /messages/:userId is generic and will work with the name.
  console.log("Inside initializeMessaging for:", teacherUsername);
  const classThreadId = `class-message-${teacherUsername}`;

  try {
    // 1. Fetch all messages from the new unified endpoint
    console.log(
      "Attempting to fetch messages from:",
      `https://tcstudentserver-production.up.railway.app/messages/${teacherUsername}`
    );
    const response = await fetch(
      `https://tcstudentserver-production.up.railway.app/messages/${teacherUsername}`
    );

    if (!response.ok) {
      console.error(
        `Fetch response not OK. Status: ${response.status}, StatusText: ${response.statusText}`
      );
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log("Fetch response OK. Parsing JSON...");
    let { threads } = await response.json();
    console.log("All threads fetched from DB for this teacher:", threads); // Log threads here
    if (!threads || !Array.isArray(threads)) {
      console.log("No threads found for teacher or invalid format.");
      threads = []; // Ensure it's an array to prevent errors
    }

    // Store the processed threads globally as a Map for easier lookup by threadId
    // Convert array of thread objects to a Map for easier lookup by threadId
    window.messageThreads = new Map(threads.map((t) => [t.threadId, t]));

    // Ensure the class thread always exists.
    if (!window.messageThreads.has(classThreadId)) {
      window.messageThreads.set(classThreadId, {
        threadId: classThreadId,
        type: "class",
        participants: [teacherUsername, "class-message-recipient"],
        messages: [],
        lastMessageTimestamp: new Date(0).toISOString(), // Puts it at the bottom if no messages
      });
    }

    console.log("Messaging initialized with threads:", window.messageThreads);
  } catch (error) {
    console.error("Failed to initialize messaging:", error);
    console.error("Error details:", error.message, error.stack);
    // On failure, ensure at least the class thread exists to avoid a blank panel
    const fallbackThreads = new Map();
    fallbackThreads.set(classThreadId, {
      threadId: classThreadId,
      type: "class",
      participants: [teacherUsername, "class-message-recipient"],
      messages: [
        {
          messageContent: "Error loading messages.",
          timestamp: new Date().toISOString(),
          senderId: "System",
        },
      ],
      lastMessageTimestamp: new Date().toISOString(),
    });
    window.messageThreads = fallbackThreads;
    console.log(
      "Messaging initialized with fallback threads:",
      window.messageThreads
    );
  }
}

// Renders the threads panel UI from the global `window.messageThreads` data
function renderThreadsPanel(options = {}) {
  const { autoSelectFirst = true } = options;

  const threadsPanel = messagesDialog.querySelector(".threads-panel");
  if (!threadsPanel) return;

  // Before clearing, find out which thread is currently active
  const previouslyActiveThread = threadsPanel.querySelector(
    ".thread-item.active-thread"
  );
  const activeThreadId = previouslyActiveThread?.dataset.threadId;

  threadsPanel.innerHTML = ""; // Clear existing content

  const allThreads = Array.from(window.messageThreads.values());
  const classThreadId = `class-message-${window.activeTeacherName}`;

  // Separate the class thread from the others
  const classThread = allThreads.find((t) => t.threadId === classThreadId);
  const otherThreads = allThreads.filter((t) => t.threadId !== classThreadId);

  // Sort the other threads by the last message timestamp
  otherThreads.sort(
    (a, b) =>
      new Date(b.lastMessageTimestamp) - new Date(a.lastMessageTimestamp)
  );

  // Combine them back, with class thread at the top
  const threads = classThread ? [classThread, ...otherThreads] : otherThreads;

  threads.forEach((thread) => {
    const threadItem = document.createElement("div");
    threadItem.className = "thread-item";
    threadItem.dataset.threadId = thread.threadId;
    // If this thread was the one that was active, re-apply the class
    if (thread.threadId === activeThreadId) {
      threadItem.classList.add("active-thread");
    }

    if (thread.hasUnread) {
      // hasUnread is a frontend-only flag
      threadItem.classList.add("has-unread");
    }

    // Derive displayName and lastMessage for preview
    const isClassMessage = thread.type === "class"; // Use thread.type
    let displayName;
    if (isClassMessage) {
      displayName = "Class Message";
    } else {
      // Find the participant who is not the current teacher to display their name
      const otherParticipant = thread.participants?.find(
        (p) => p !== window.activeTeacherName
      );
      displayName = otherParticipant || thread.threadId; // Fallback to threadId
    }
    const lastMessageObj =
      thread.messages.length > 0
        ? thread.messages[thread.messages.length - 1]
        : null;
    const lastMessageContent = lastMessageObj
      ? lastMessageObj.messageContent
      : "No messages yet.";
    const displayTime =
      thread.lastMessageTimestamp === "1970-01-01T00:00:00.000Z" ||
      !thread.lastMessageTimestamp
        ? ""
        : new Date(thread.lastMessageTimestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });

    threadItem.innerHTML = `
          <div class="thread-info">
            <span class="thread-name">${displayName}</span>
            <span class="thread-preview">${lastMessageContent}</span>
          </div>
          <span class="thread-timestamp">${displayTime}</span>
        `;
    threadsPanel.appendChild(threadItem);
  });

  // Automatically select and display the first (most recent) thread
  if (autoSelectFirst) {
    const firstThread = threadsPanel.querySelector(".thread-item");
    if (firstThread) {
      firstThread.click();
    }
  }
}

document.addEventListener("DOMContentLoaded", function () {
  // Show sign-on dialog by default
  if (!signOnDialog.open) {
    signOnDialog.showModal();
  }

  const dialog = document.getElementById("globalDialog");

  signOnDialog
    .querySelector("#signOnForm")
    .addEventListener("submit", async function (e) {
      e.preventDefault();
      const username = signOnDialog
        .querySelector("#signOnUsername")
        .value.trim();
      const pin = signOnDialog.querySelector("#signOnPin").value.trim();
      const errorDiv = signOnDialog.querySelector("#signOnError");
      errorDiv.textContent = "";
      if (!username || !pin) {
        errorDiv.textContent = "Please enter both username and PIN.";
        return;
      }
      try {
        const hashedPin = await hashPin(pin);
        const response = await fetch("https://tcstudentserver-production.up.railway.app/findTeacher", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parcel: [username, hashedPin] }),
        });
        if (response.ok) {
          const data = await response.json();
          const teacherName = data.teacherName || username;

          window.activeTeacherUsername = username;
          window.activeTeacherName = teacherName;

          socket.emit("identify", teacherName);
          signOnDialog.close();

          document
            .querySelector(".dashboard")
            ?.classList.remove("hidden-until-login");
          document
            .querySelector(".navbar")
            ?.classList.remove("hidden-until-login");

          const navbarText = document.querySelector(".navbar-text");
          if (navbarText) navbarText.textContent = teacherName;

          loadTeacherStudents(username);
          initializeMessaging(teacherName);

          // --- FETCH EMAIL SETTINGS AND POPULATE ---
          fetch(`https://tcstudentserver-production.up.railway.app/emailSettings/${username}`)
            .then((r) => r.json())
            .then((settings) => {
              window.addressBook = Array.isArray(settings.addresses)
                ? settings.addresses
                : [];
              window.emailTemplates = Array.isArray(settings.templates)
                ? settings.templates
                : [];
              window.emailGroups = Array.isArray(settings.groups)
                ? settings.groups
                : [];
              renderAddressBook();
              renderEmailTemplates();
              renderGroups();
            })
            .catch((err) => {
              window.addressBook = [];
              window.emailTemplates = [];
              window.emailGroups = [];
              renderAddressBook();
              renderEmailTemplates();
              renderGroups();
            });

          // --- CHECK AND PROMPT SMTP CONFIG ---
          checkAndPromptSmtpConfig();
        } else {
          errorDiv.textContent = "Invalid username or PIN.";
        }
      } catch (err) {
        console.error("Sign-on failed:", err);
        errorDiv.textContent = "Server error. Please try again.";
      }
    });

  dialog.close();

  // Open dialog function
  window.openGlobalDialog = function (title, content, options = {}) {
    // Make sure sign-on dialog is closed first
    if (signOnDialog.open) {
      signOnDialog.close();
    }

    const dialogTitle = document.getElementById("dialogTitle");
    const dialogContent = document.getElementById("dialogContent");

    dialogTitle.textContent = title || "Dialog";

    // Handle message sending dialogs via a callback
    if (options.onSend && typeof options.onSend === "function") {
      dialogContent.innerHTML = `
        <div style="display:flex; flex-direction:column; height: 100%; text-align:left; gap: 1em;">
          <p>${
            content ||
            `Sending message to: <strong>${
              options.recipient || "recipient"
            }</strong>`
          }</p>
          <textarea id="globalDialogTextarea" style="width: 100%; flex-grow: 1; resize: none; padding: 0.5em; border-radius: 8px; border: none; background: rgba(255,255,255,0.1); color: #fff; font-family: inherit; font-size: 1em;" placeholder="Type your message..."></textarea>
          <button id="globalDialogSendBtn" class="btn" style="background: #00ffcc; color: #3b0a70; font-weight: 700;">Send Message</button>
        </div>
      `;

      const sendBtn = document.getElementById("globalDialogSendBtn");
      const textarea = document.getElementById("globalDialogTextarea");

      const sendAction = () => {
        const messageText = textarea.value.trim();
        if (messageText) {
          options.onSend(messageText);
          window.closeGlobalDialog();
        }
      };

      const keydownHandler = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendAction();
        }
      };

      // Add listeners
      sendBtn.addEventListener("click", sendAction);
      textarea.addEventListener("keydown", keydownHandler);

      // IMPORTANT: Clean up listeners when the dialog closes to prevent memory leaks
      dialog.addEventListener(
        "close",
        () => {
          sendBtn.removeEventListener("click", sendAction);
          textarea.removeEventListener("keydown", keydownHandler);
        },
        { once: true }
      );
    } else {
      // Default behavior for simple informational dialogs
      dialogContent.innerHTML = `<p>${
        content || "This is a reusable dialog."
      }</p>`;
    }

    if (!dialog.open) dialog.showModal();
  };

  // Close dialog function
  window.closeGlobalDialog = function () {
    window.allowGlobalDialogOpen = false; // Reset flag
    if (dialog.open) dialog.close();
  };

  // Close button event
  dialog
    .querySelector("#closeGlobalDialog")
    .addEventListener("click", function () {
      window.closeGlobalDialog();
    });

  // Sidebar buttons - REFACTORED to use IDs
  document
    .getElementById("createLessonBtn")
    ?.addEventListener("click", function () {
      window.openGlobalDialog(
        "Create Lesson",
        "This is the Create Lesson dialog."
      );
      console.log("Create Lesson button clicked");
    });

  document
    .getElementById("sendClassMessageBtn")
    ?.addEventListener("click", function () {
      window.openGlobalDialog(
        "Send Class Message",
        "Enter the message to send to the entire class:",
        {
          recipient: "Entire Class",
          onSend: (messageText) => {
            // MODIFIED: Handle closing globalDialog and opening messagesDialog
            // Use the special 'class-message-NAME' recipient to trigger a class-wide message
            const sentThreadId = sendMessage(
              window.activeTeacherName,
              `class-message-${window.activeTeacherName}`,
              messageText
            );
            window.closeGlobalDialog(); // Close the current dialog
            messagesDialog.showModal(); // Open the messages dialog
            renderThreadsPanel({ autoSelectFirst: false }); // Render threads, but don't auto-select the first one
            // Find and click the specific thread item
            const threadItem = messagesDialog.querySelector(
              `[data-thread-id="${CSS.escape(sentThreadId)}"]`
            );
            if (threadItem) {
              threadItem.click();
            }
          },
        }
      );
      console.log("Send Class Message button clicked");
    });

  // FIX: Use openEmailDialog for Email Parents/Staff
  document
    .getElementById("emailParentsBtn")
    ?.addEventListener("click", function () {
      openEmailDialog();
      console.log("Email Parents/Staff button clicked");
    });

  document
    .getElementById("accessWhirlpoolBtn")
    ?.addEventListener("click", function () {
      window.openGlobalDialog(
        "Access Whirlpool",
        "This is the Access Whirlpool dialog."
      );
      console.log("Access Whirlpool button clicked");
    });

  // Register Students button
  const registerStudentsBtn = document.getElementById("registerStudentsBtn");
  if (registerStudentsBtn) {
    registerStudentsBtn.addEventListener("click", function () {
      // Dialog content for Register Students
      const content = `
        <form id="registerForm" style="display:flex;flex-direction:column;align-items:center;gap:2em;width:100%;height:100%;justify-content:flex-start;">
          <div style="width:100%;background:rgba(255,255,255,0.08);padding:1em 0.5em 0.5em 0.5em;border-radius:16px 16px 0 0;">
            <label style="font-weight:700;display:block;width:100%;text-align:left;">Teacher Email Address</label>
            <input type="email" id="teacherEmailInput" placeholder="Your email address" style="margin-top:0.5em;width:100%;max-width:350px;padding:0.5em 1em;border-radius:8px;border:none;font-size:1.1em;" required />
          </div>
          <div style="width:100%;background:rgba(255,255,255,0.08);padding:1em 0.5em 0.5em 0.5em;border-radius:0;">
            <label style="font-weight:700;display:block;width:100%;text-align:left;">How many class periods do you teach?</label>
            <input type="number" id="numPeriods" min="1" max="10" value="1" style="margin-top:0.5em;width:100%;max-width:300px;padding:0.5em 1em;border-radius:8px;border:none;font-size:1.1em;" required />
          </div>
          <div id="studentsPerPeriodInputs" style="width:100%;"></div>
          <div style="width:100%;display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:1.1em;background:rgba(255,255,255,0.05);padding:0.75em 1em;border-radius:8px;">
            <span>Total Students:</span>
            <span id="totalStudents">0</span>
          </div>
          <button type="button" id="generateClassCodesBtn" style="width:100%;max-width:320px;margin-top:1em;padding:0.7em 0;font-size:1.1em;border-radius:8px;" class="btn btn-primary">Generate Class Codes</button>
          <div id="classCodesResult" style="width:100%;margin-top:1em;"></div>
        </form>
      `;
      window.openGlobalDialog("Register Students", "");
      document.getElementById("dialogContent").innerHTML = content;
      // Helper to update student inputs
      function updateStudentInputs() {
        const numPeriods =
          parseInt(document.getElementById("numPeriods").value) || 1;
        const container = document.getElementById("studentsPerPeriodInputs");
        container.innerHTML = "";
        for (let i = 1; i <= numPeriods; i++) {
          container.innerHTML += `<div style='display:flex;align-items:center;gap:1em;margin-bottom:0.7em;width:100%;'><label style='flex:1;font-weight:500;'>Students in Period ${i}:</label><input type='number' class='studentsInPeriod' min='1' value='1' style='width:100px;padding:0.4em 0.7em;border-radius:6px;border:none;font-size:1em;' required /></div>`;
        }
        updateTotal();
      }
      // Helper to update total
      function updateTotal() {
        const studentInputs = document.querySelectorAll(".studentsInPeriod");
        let total = 0;
        studentInputs.forEach((input) => {
          total += parseInt(input.value) || 0;
        });
        document.getElementById("totalStudents").textContent = total;
      }
      // Initial setup
      updateStudentInputs();
      document
        .getElementById("numPeriods")
        .addEventListener("input", updateStudentInputs);
      document
        .getElementById("studentsPerPeriodInputs")
        .addEventListener("input", updateTotal);
      // Generate Class Codes button
      document
        .getElementById("generateClassCodesBtn")
        .addEventListener("click", async function () {
          const emailInput = document.getElementById("teacherEmailInput");
          const teacherEmail = emailInput.value.trim();
          if (!teacherEmail) {
            emailInput.focus();
            emailInput.style.border = "2px solid #ffb3b3";
            return;
          } else {
            emailInput.style.border = "";
          }
          const numPeriods =
            parseInt(document.getElementById("numPeriods").value) || 1;
          // Periods as ['01', '02', ...]
          const periods = Array.from({ length: numPeriods }, (_, i) =>
            (i + 1).toString().padStart(2, "0")
          );
          const resultDiv = document.getElementById("classCodesResult");
          resultDiv.innerHTML =
            '<span style="color:#fff;">Generating codes...</span>';
          try {
            const payload = {
              parcel: [window.activeTeacherUsername, teacherEmail, periods],
            };
            console.log("Sending to /generateClassCodes:", payload);
            const response = await fetch(
              "https://tcstudentserver-production.up.railway.app/generateClassCodes",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              }
            );
            const data = await response.json();
            if (response.ok && data.codes) {
              resultDiv.innerHTML = `<div style='margin-top:1em;text-align:left;'><b>Class Codes:</b><ul style='margin:0.5em 0 0 1.2em;padding:0;'>${data.codes
                .map((code) => `<li style='word-break:break-all;'>${code}</li>`)
                .join("")}</ul></div>`;
            } else {
              resultDiv.innerHTML = `<span style='color:#ffb3b3;'>${
                data.error || "Error generating codes."
              }</span>`;
            }
          } catch (err) {
            resultDiv.innerHTML = `<span style='color:#ffb3b3;'>Server error. Please try again.</span>`;
          }
        });
    });
  }

  // Student message buttons - use event delegation since they're added dynamically
  document.addEventListener("click", function (e) {
    if (e.target && e.target.classList.contains("message-btn")) {
      const student =
        e.target.closest(".student-card").querySelector("h5")?.textContent ||
        "";
      if (student) {
        window.openGlobalDialog(
          `Message Student: ${student}`,
          `Enter your message for <strong>${student}</strong>:`,
          {
            recipient: student,
            onSend: (messageText) => {
              // MODIFIED: Handle closing globalDialog and opening messagesDialog
              // The 'student' variable here is the student's full name
              const sentThreadId = sendMessage(
                window.activeTeacherName,
                student,
                messageText
              );
              window.closeGlobalDialog(); // Close the current dialog
              messagesDialog.showModal(); // Open the messages dialog
              renderThreadsPanel({ autoSelectFirst: false }); // Render threads, but don't auto-select the first one
              // Find and click the specific thread item
              const threadItem = messagesDialog.querySelector(
                `[data-thread-id="${CSS.escape(sentThreadId)}"]`
              );
              if (threadItem) {
                threadItem.click();
              }
            },
          }
        );
        console.log(`Message button clicked for: ${student}`);
      }
    }
  });

  // Messages button
  document
    .getElementById("messagesBtn")
    ?.addEventListener("click", function () {
      if (signOnDialog.open) signOnDialog.close();
      const globalDialog = document.getElementById("globalDialog");
      if (globalDialog.open) globalDialog.close();

      // Open the messages dialog
      if (!messagesDialog.open) {
        messagesDialog.showModal();
        renderThreadsPanel(); // Render threads from memory when dialog is opened
      }
      console.log("Messages button clicked");
    });

  // --- NEW LOGIC FOR MESSAGES DIALOG ---
  const threadsPanel = messagesDialog.querySelector(".threads-panel");
  const messagesBody = messagesDialog.querySelector(".messages-list");
  const messageInput = messagesDialog.querySelector("#messageInput");
  const sendMessageBtn = messagesDialog.querySelector("#sendMessageBtn");

  // Function to handle sending a message from the main dialog
  const sendMessageFromDialog = () => {
    const message = messageInput.value.trim();
    const activeThread = threadsPanel.querySelector(
      ".thread-item.active-thread"
    );

    if (message && activeThread) {
      const recipient = activeThread.dataset.threadId;
      let actualRecipientForServer;

      if (recipient.startsWith("class-message-")) {
        actualRecipientForServer = recipient; // For class messages, the threadId is the recipientId
      } else {
        // For private messages, the threadId is "StudentName_TeacherName"
        // We need to extract the student's name as the actual recipient for the server
        const participants = recipient.split("_");
        actualRecipientForServer = participants.find(
          (p) => p !== window.activeTeacherName
        );
      }
      sendMessage(window.activeTeacherName, actualRecipientForServer, message);
      messageInput.value = ""; // Clear input after sending
      messageInput.focus();
    }
  };

  // Event listeners for sending messages from the main dialog
  sendMessageBtn.addEventListener("click", sendMessageFromDialog);
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // Prevent new line on Enter
      sendMessageFromDialog();
    }
  });

  // Handle switching between threads
  threadsPanel.addEventListener("click", (e) => {
    // This is the event listener for clicking on a thread in the left panel
    const threadItem = e.target.closest(".thread-item");
    if (threadItem) {
      const currentTeacher = window.activeTeacherName;
      if (!messagesBody || !currentTeacher) return;

      // Remove active class from all threads
      threadsPanel
        .querySelectorAll(".thread-item")
        .forEach((item) => item.classList.remove("active-thread"));
      // Add active class to the clicked thread
      threadItem.classList.add("active-thread");
      // When a thread is clicked, it's considered "read"
      threadItem.classList.remove("has-unread");
      const threadId = threadItem.dataset.threadId;
      if (window.messageThreads.has(threadId)) {
        window.messageThreads.get(threadId).hasUnread = false;
      }

      console.log(`Switched to thread: ${threadId}`);

      // Clear previous messages
      messagesBody.innerHTML = ""; // Clear the messages display area

      // Render messages from the stored data, not from a new fetch
      const threadData = window.messageThreads.get(threadId);
      if (threadData && threadData.messages) {
        threadData.messages.forEach((msg) => {
          const wrapperElement = document.createElement("div");
          wrapperElement.classList.add("message-wrapper");
          wrapperElement.classList.add(
            msg.senderId === currentTeacher ? "sent" : "received"
          );

          const senderTag = // This is for displaying the sender's name in class messages
            msg.isClassMessage && msg.senderId !== currentTeacher
              ? `<strong class="message-sender-name">${msg.senderId}</strong>`
              : "";
          const timestamp = new Date(msg.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          wrapperElement.innerHTML = `
            <div class="message-item">
              ${senderTag}
              <p class="message-content">${msg.messageContent}</p>
            </div>
            <span class="message-timestamp">${timestamp}</span>
          `;
          messagesBody.appendChild(wrapperElement);
        });

        messagesBody.scrollTop = messagesBody.scrollHeight; // Scroll to bottom
      }
    }
  });
});

// Fetch and display students by class period after login
async function loadTeacherStudents(teacherUsername) {
  try {
    const response = await fetch("https://tcstudentserver-production.up.railway.app/teacherDashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherUsername }),
    });
    const data = await response.json();
    if (response.ok && Array.isArray(data.students)) {
      // Clear all students from each period
      document
        .querySelectorAll(".students-grid")
        .forEach((grid) => (grid.innerHTML = ""));
      data.students.forEach((student) => {
        // Determine period index (1-based)
        let periodNum = parseInt(student.classPeriod);
        if (isNaN(periodNum) || periodNum < 1 || periodNum > 3) periodNum = 1;
        const periodGrid = document.querySelector(
          `.class-period:nth-of-type(${periodNum}) .students-grid`
        );
        if (periodGrid) {
          const card = document.createElement("div");
          card.className = "student-card";
          card.innerHTML = `
            <canvas class="student-pie"></canvas>
            <div class="student-info">
              <h5>${student.memberName}</h5>
              <p>Checking: $${student.checkingBalance}</p>
              <p>Savings: $${student.savingsBalance}</p>
              <p>Grade: ${student.grade}</p>
              <p>Lessons: ${student.lessonsCompleted}</p>
              <button class="message-btn">Message</button>
            </div>
          `;
          periodGrid.appendChild(card);
        }
      });
    }
  } catch (err) {
    console.error("Failed to load students:", err);
  }
}

// Listen for new students being added live via socket.io
const socket = io("https://tcstudentserver-production.up.railway.app", {
  withCredentials: true,
});

socket.on("studentAdded", (student) => {
  // Determine period index (1-based)
  let periodNum = parseInt(student.classPeriod);
  if (isNaN(periodNum) || periodNum < 1 || periodNum > 3) periodNum = 1;
  const periodGrid = document.querySelector(
    `.class-period:nth-of-type(${periodNum}) .students-grid`
  );
  if (periodGrid) {
    const card = document.createElement("div");
    card.className = "student-card";
    card.innerHTML = `
      <canvas class="student-pie"></canvas>
      <div class="student-info">
        <h5>${student.memberName}</h5>
        <p>Checking: $${student.checkingBalance}</p>
        <p>Savings: $${student.savingsBalance}</p>
        <p>Grade: ${student.grade}</p>
        <p>Lessons: ${student.lessonsCompleted}</p>
        <button class="message-btn">Message</button>
      </div>
    `;
    periodGrid.appendChild(card);
  }
});

// Listen for new messages and update the messages dialog
socket.on("newMessage", (message) => {
  const { senderId, recipientId, messageContent, timestamp, isClassMessage } =
    message; // The incoming message object from the server
  const currentTeacher = window.activeTeacherName;
  const messagesBody = messagesDialog.querySelector(".messages-list"); // Corrected selector
  const threadsPanel = messagesDialog.querySelector(".threads-panel"); // Left panel with thread list

  if (!messagesBody || !threadsPanel || !window.messageThreads) return;

  console.log("Received new message:", message);

  // Determine the thread ID for the incoming message
  let threadId;
  if (isClassMessage) {
    threadId = `class-message-${currentTeacher}`; // Consistent threadId for class messages
  } else {
    const sortedParticipants = [senderId, recipientId].sort();
    threadId = sortedParticipants.join("_");
  }

  // If the message is from the teacher to themselves (e.g., class message),
  // ensure the threadId is correctly identified as their class message thread.
  if (isClassMessage && senderId === currentTeacher) {
    // This is the teacher's own class message being echoed back
    // The threadId should already be correct from the above logic.
  }

  // --- UPDATE THE CENTRAL DATA STORE ---
  // Find or create the thread in our data map
  if (!window.messageThreads.has(threadId)) {
    // This can happen if the message is the very first message in a new thread
    // that wasn't initiated by the current user (e.g., a student messages the teacher first).
    console.log(
      `newMessage received for new threadId: ${threadId}. Creating it.`
    );
    window.messageThreads.set(threadId, {
      threadId: threadId,
      type: isClassMessage ? "class" : "private",
      participants: isClassMessage
        ? [senderId, "class-message-recipient"]
        : [senderId, recipientId], // Add participants
      messages: [],
      lastMessageTimestamp: timestamp, // Set initial timestamp
    });
  }
  const threadData = window.messageThreads.get(threadId);

  // Add the new message and update the preview info
  threadData.messages.push(message);
  threadData.lastMessageTimestamp = timestamp; // Update the timestamp

  // --- UPDATE THE UI ---
  // Re-render the threads panel to update previews and sorting
  // We set autoSelectFirst to false to prevent it from re-triggering a click event,
  // which would cause the message to be rendered twice.
  renderThreadsPanel({ autoSelectFirst: false });

  // Check if the messages dialog is open and if this message belongs to the currently active thread
  const activeThreadElement = threadsPanel.querySelector(
    ".thread-item.active-thread"
  );
  const isActiveThreadMessage =
    activeThreadElement && activeThreadElement.dataset.threadId === threadId;
  if (messagesDialog.open) {
    // If the new message belongs to the currently active thread, append it
    if (isActiveThreadMessage) {
      const wrapperElement = document.createElement("div");
      wrapperElement.classList.add("message-wrapper");
      wrapperElement.classList.add(
        senderId === currentTeacher ? "sent" : "received"
      );

      const senderTag =
        isClassMessage && senderId !== currentTeacher
          ? `<strong class="message-sender-name">${senderId}</strong>`
          : "";
      const formattedTimestamp = new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      wrapperElement.innerHTML = `
        <div class="message-item">
          ${senderTag}
          <p class="message-content">${messageContent}</p>
        </div>
        <span class="message-timestamp">${formattedTimestamp}</span>
      `;
      messagesBody.appendChild(wrapperElement);
      messagesBody.scrollTop = messagesBody.scrollHeight;
    }
  } else {
    // If the dialog is closed, mark the thread as unread so it shows a notification
    threadData.hasUnread = true;
  }
});

// Close button for messages dialog
const closeMessagesDialogBtn = document.getElementById("closeMessagesDialog");
if (closeMessagesDialogBtn) {
  closeMessagesDialogBtn.addEventListener("click", function () {
    if (messagesDialog.open) {
      messagesDialog.close();
    }
  });
}

// --- EMAIL PARENTS/STAFF FEATURE ---
// Email dialog state
window.emailTemplates = [];
window.savedEmails = [];

function openEmailDialog() {
  // Build dialog HTML
  const dialog = document.getElementById("globalDialog");
  const dialogTitle = document.getElementById("dialogTitle");
  const dialogContent = document.getElementById("dialogContent");
  dialogTitle.textContent = "Email Parents/Staff";
  dialogContent.innerHTML = `
    <form id="emailForm" style="display:flex;flex-direction:column;gap:1.5em;">
      <div style="display:flex;gap:1.5em;flex-wrap:wrap;">
        <div style="flex:2;min-width:260px;background:rgba(255,255,255,0.08);padding:1em 1.2em 1.2em 1.2em;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
          <h5 style="margin:0 0 0.7em 0;color:#00ffcc;font-weight:700;">Compose Email</h5>
          <div style="margin-bottom:0.7em;">
            <label style="font-weight:600;">To:</label>
            <input type="text" id="emailRecipients" placeholder="Type or select from address book or group" style="padding:0.5em;border-radius:6px;border:none;width:100%;margin-top:0.3em;" />
            <select id="groupSelect" style="margin-top:0.5em;width:100%;padding:0.4em;border-radius:6px;border:none;">
              <option value="">-- Select Group (optional) --</option>
            </select>
          </div>
          <input type="text" id="emailSubject" placeholder="Subject" style="padding:0.5em;border-radius:6px;border:none;margin-bottom:0.7em;width:100%;" />
          <textarea id="emailMessage" placeholder="Message" style="min-height:100px;padding:0.5em;border-radius:6px;border:none;width:100%;margin-bottom:1em;"></textarea>
          <div style="display:flex;gap:0.7em;justify-content:flex-end;">
            <button type="button" id="sendEmailBtn" class="btn btn-primary" style="background:#00ffcc;color:#3b0a70;font-weight:700;">Send</button>
          </div>
        </div>
        <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:1.2em;">
          <div style="background:rgba(255,255,255,0.06);padding:1em 1em 1.2em 1em;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.03);">
            <h6 style="margin:0 0 0.5em 0;color:#00ffcc;font-weight:700;">Address Book</h6>
            <input type="text" id="addressInput" placeholder="Add email address" style="padding:0.4em;border-radius:6px;border:none;width:100%;margin-bottom:0.5em;" />
            <button type="button" id="saveAddressBtn" class="btn btn-sm" style="background:#00ffcc;color:#3b0a70;font-weight:700;width:100%;margin-bottom:0.7em;">Save Address</button>
            <div id="addressBookList" style="max-height:80px;overflow:auto;"></div>
          </div>
          <div style="background:rgba(255,255,255,0.06);padding:1em 1em 1.2em 1em;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.03);">
            <h6 style="margin:0 0 0.5em 0;color:#00ffcc;font-weight:700;">Templates</h6>
            <div style="display:flex;gap:0.5em;align-items:center;">
              <select id="templateSelect" style="flex:1;padding:0.5em;border-radius:6px;border:none;"></select>
              <button type="button" id="applyTemplateBtn" class="btn btn-sm" style="background:#00ffcc;color:#3b0a70;font-weight:700;min-width:110px;">Apply</button>
            </div>
            <input type="text" id="templateSubject" placeholder="Template Subject" style="margin-top:0.5em;padding:0.4em;border-radius:6px;border:none;width:100%;" />
            <textarea id="templateMessage" placeholder="Template Message" style="margin-top:0.5em;min-height:40px;padding:0.4em;border-radius:6px;border:none;width:100%;"></textarea>
            <button type="button" id="saveTemplateBtn" class="btn btn-sm" style="background:#9575cd;color:#fff;font-weight:700;width:100%;margin-top:0.5em;">Save as Template</button>
          </div>
          <div style="background:rgba(255,255,255,0.06);padding:1em 1em 1.2em 1em;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.03);">
            <h6 style="margin:0 0 0.5em 0;color:#00ffcc;font-weight:700;">Groups</h6>
            <input type="text" id="groupNameInput" placeholder="Group Name" style="padding:0.4em;border-radius:6px;border:none;width:100%;margin-bottom:0.5em;" />
            <div id="groupAddressSelect" style="margin-bottom:0.5em;"></div>
            <button type="button" id="saveGroupBtn" class="btn btn-sm" style="background:#00ffcc;color:#3b0a70;font-weight:700;width:100%;">Create Group</button>
            <div id="groupList" style="max-height:60px;overflow:auto;margin-top:0.5em;"></div>
          </div>
        </div>
      </div>
    </form>
  `;
  if (!dialog.open) dialog.showModal();
  renderAddressBook();
  renderEmailTemplates();
  renderGroups();
  // Event handlers
  document.getElementById("sendEmailBtn").onclick = sendEmail;
  document.getElementById("saveAddressBtn").onclick = saveAddress;
  document.getElementById("applyTemplateBtn").onclick = applyTemplate;
  document.getElementById("saveTemplateBtn").onclick = saveTemplate;
  document.getElementById("saveGroupBtn").onclick = saveGroup;
  document.getElementById("groupSelect").onchange = handleGroupSelect;
}

// Add this style block to the top of the file or inject into the DOM on page load
(function addEmailModalStyles() {
  const style = document.createElement("style");
  style.innerHTML = `
    #templateSelect {
      max-width: 70%;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: inline-block;
      vertical-align: middle;
    }
    #templateSelect option {
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: block;
    }
    #applyTemplateBtn {
      white-space: nowrap;
    }
    /* Responsive fix for flex container */
    #templateSelect, #applyTemplateBtn {
      flex-shrink: 1;
    }
  `;
  document.head.appendChild(style);
})();

// --- Address Book Logic ---
window.addressBook = [];
function renderAddressBook() {
  const list = document.getElementById("addressBookList");
  if (!list) return;
  list.innerHTML = window.addressBook
    .map(
      (addr, i) =>
        `<div style='display:flex;align-items:center;gap:0.5em;'><span>${addr}</span><button type='button' style='background:none;border:none;color:#ffb3b3;cursor:pointer;font-size:1.1em;' onclick='window.removeAddress(${i})' title='Remove'>&times;</button></div>`
    )
    .join("");
  renderGroupAddressSelect();
}
window.removeAddress = function (idx) {
  window.addressBook.splice(idx, 1);
  renderAddressBook();
  renderGroups();
};
function saveAddress() {
  const input = document.getElementById("addressInput");
  const val = input.value.trim();
  if (!val || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val))
    return alert("Enter a valid email address.");
  if (!window.addressBook.includes(val)) {
    window.addressBook.push(val);
    renderAddressBook();
    // Send to server
    fetch("https://tcstudentserver-production.up.railway.app/saveEmailAddress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: window.activeTeacherUsername || "Unknown",
        address: val,
      }),
    });
  }
  input.value = "";
}

// --- Template Logic ---
window.emailTemplates = [];
function renderEmailTemplates() {
  const select = document.getElementById("templateSelect");
  if (!select) return;
  select.innerHTML = window.emailTemplates
    .map((t, i) => `<option value='${i}'>${t.subject}</option>`)
    .join("");
}
function applyTemplate() {
  const idx = document.getElementById("templateSelect").value;
  if (window.emailTemplates[idx]) {
    document.getElementById("emailSubject").value =
      window.emailTemplates[idx].subject;
    document.getElementById("emailMessage").value =
      window.emailTemplates[idx].message;
  }
}
function saveTemplate() {
  const subject = document.getElementById("templateSubject").value.trim();
  const message = document.getElementById("templateMessage").value.trim();
  if (!subject || !message) return alert("Subject and message required.");
  window.emailTemplates.push({ subject, message });
  renderEmailTemplates();
  document.getElementById("templateSubject").value = "";
  document.getElementById("templateMessage").value = "";
  // Send to server
  fetch("https://tcstudentserver-production.up.railway.app/saveEmailTemplate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: window.activeTeacherUsername || "Unknown",
      subject,
      message,
    }),
  });
}

// --- Group Logic ---
window.emailGroups = [];
function renderGroups() {
  const groupList = document.getElementById("groupList");
  const groupSelect = document.getElementById("groupSelect");
  if (groupList) {
    groupList.innerHTML = window.emailGroups
      .map(
        (g, i) =>
          `<div style='display:flex;align-items:center;gap:0.5em;'><span>${g.name} (${g.addresses.length})</span><button type='button' style='background:none;border:none;color:#ffb3b3;cursor:pointer;font-size:1.1em;' onclick='window.removeGroup(${i})' title='Remove'>&times;</button></div>`
      )
      .join("");
  }
  if (groupSelect) {
    groupSelect.innerHTML =
      `<option value=''>-- Select Group (optional) --</option>` +
      window.emailGroups
        .map((g, i) => `<option value='${i}'>${g.name}</option>`)
        .join("");
  }
}
window.removeGroup = function (idx) {
  window.emailGroups.splice(idx, 1);
  renderGroups();
};
function renderGroupAddressSelect() {
  const container = document.getElementById("groupAddressSelect");
  if (!container) return;
  container.innerHTML = window.addressBook.length
    ? window.addressBook
        .map(
          (addr, i) =>
            `<label style='display:block;'><input type='checkbox' value='${addr}' /> ${addr}</label>`
        )
        .join("")
    : `<span style='color:#ccc;'>No addresses in address book.</span>`;
}
function saveGroup() {
  const name = document.getElementById("groupNameInput").value.trim();
  const checked = Array.from(
    document.querySelectorAll(
      "#groupAddressSelect input[type=checkbox]:checked"
    )
  );
  if (!name || !checked.length)
    return alert("Enter group name and select at least one address.");
  const addresses = checked.map((cb) => cb.value);
  window.emailGroups.push({ name, addresses });
  renderGroups();
  document.getElementById("groupNameInput").value = "";
  renderGroupAddressSelect();
  // Send to server
  fetch("https://tcstudentserver-production.up.railway.app/saveEmailGroup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: window.activeTeacherUsername || "Unknown",
      name,
      addresses,
    }),
  });
}
function handleGroupSelect(e) {
  const idx = e.target.value;
  if (window.emailGroups[idx]) {
    document.getElementById("emailRecipients").value =
      window.emailGroups[idx].addresses.join(", ");
  }
}

// --- Compose Email Logic ---
function sendEmail() {
  const recipients = document.getElementById("emailRecipients").value.trim();
  const subject = document.getElementById("emailSubject").value.trim();
  const message = document.getElementById("emailMessage").value.trim();
  if (!recipients) return alert("Please enter at least one recipient.");
  // Send to backend for logging and possible delivery
  fetch("https://tcstudentserver-production.up.railway.app/sendEmail", {
    // Changed from 5000 to 3000
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: window.activeTeacherUsername || "Unknown",
      recipients,
      subject,
      message,
    }),
  })
    .then((response) => {
      if (response.ok) {
        alert(`Email sent to: ${recipients}\nSubject: ${subject}`);
      } else {
        console.error("Failed to send email:", response.status);
        alert(
          `Failed to send email. Please try again. (Status: ${response.status})`
        );
      }
    })
    .catch((error) => {
      console.error("Error sending email:", error);
      alert("Error sending email. Please check your network and try again.");
    });
}

// --- SMTP CONFIG MODAL ---
function showSmtpConfigModal() {
  // Remove any existing modal
  let oldModal = document.getElementById("smtpConfigModal");
  if (oldModal) oldModal.remove();
  const modal = document.createElement("dialog");
  modal.id = "smtpConfigModal";
  modal.innerHTML = `
    <form id="smtpConfigForm" style="display:flex;flex-direction:column;gap:1em;min-width:320px;">
      <h3>Set Up Your School Email</h3>
      <label>SMTP Host <input type="text" name="smtpHost" required placeholder="smtp.gmail.com" /></label>
      <label>SMTP Port <input type="number" name="smtpPort" required placeholder="465" min="1" max="65535" /></label>
      <label>Email Address <input type="email" name="emailAddress" required placeholder="your@school.org" /></label>
      <label>SMTP Username <input type="text" name="smtpUsername" required placeholder="your@school.org" /></label>
      <label>SMTP Password <input type="password" name="smtpPassword" required autocomplete="new-password" /></label>
      <label style="display:flex;align-items:center;gap:0.5em;">
        <input type="checkbox" name="useOauth2" id="useOauth2Checkbox" /> Use OAuth2 (Google/Outlook)
      </label>
      <div id="oauth2Info" style="display:none;font-size:0.95em;color:#888;">OAuth2 setup will be handled after saving these details.</div>
      <button type="submit" class="btn btn-primary" style="margin-top:1em;">Save Email Settings</button>
    </form>
  `;
  document.body.appendChild(modal);
  modal.showModal();

  // Toggle OAuth2 info
  modal
    .querySelector("#useOauth2Checkbox")
    .addEventListener("change", function () {
      modal.querySelector("#oauth2Info").style.display = this.checked
        ? "block"
        : "none";
    });

  // Handle form submit
  modal.querySelector("#smtpConfigForm").onsubmit = async function (e) {
    e.preventDefault();
    const form = e.target;
    const data = {
      smtpHost: form.smtpHost.value.trim(),
      smtpPort: parseInt(form.smtpPort.value, 10),
      emailAddress: form.emailAddress.value.trim(),
      smtpUsername: form.smtpUsername.value.trim(),
      smtpPassword: form.smtpPassword.value,
      useOauth2: form.useOauth2.checked,
    };
    // Save to backend
    try {
      const resp = await fetch("https://tcstudentserver-production.up.railway.app/saveSmtpConfig", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherUsername: window.activeTeacherUsername,
          config: data,
        }),
      });
      if (resp.ok) {
        alert("Email settings saved!");
        modal.close();
      } else {
        alert("Failed to save email settings.");
      }
    } catch (err) {
      alert("Error saving email settings.");
    }
  };
}

// After successful sign-in, check if SMTP config exists and show modal if not
async function checkAndPromptSmtpConfig() {
  try {
    const resp = await fetch(
      `https://tcstudentserver-production.up.railway.app/getSmtpConfig/${window.activeTeacherUsername}`
    );
    if (resp.ok) {
      const data = await resp.json();
      if (!data || !data.smtpHost) {
        showSmtpConfigModal();
      }
    }
  } catch (err) {
    // On error, still show modal to allow setup
    showSmtpConfigModal();
  }
}
