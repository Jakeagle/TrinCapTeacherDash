// Get sign-on dialog from the DOM
const signOnDialog = document.getElementById("signOnDialog");
const messagesDialog = document.getElementById("messagesDialog");
const loadingOverlay = document.getElementById("loadingOverlay");

// Loading Spinner Functions
function showLoadingSpinner(
  text = "Please wait...",
  subtext = "Loading teacher dashboard"
) {
  if (loadingOverlay) {
    const loadingText = loadingOverlay.querySelector(".loading-text");
    const loadingSubtext = loadingOverlay.querySelector(".loading-subtext");

    if (loadingText) loadingText.textContent = text;
    if (loadingSubtext) loadingSubtext.textContent = subtext;

    loadingOverlay.classList.remove("hidden");
  }
}

function hideLoadingSpinner() {
  if (loadingOverlay) {
    loadingOverlay.classList.add("hidden");
  }
}

// This will be the new central data store for all message threads
window.messageThreads = new Map();
window.teacherUnits = [];
window.allTeacherLessons = [];

// --- Environment Configuration ---
const isProduction =
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1";

const PROD_API_BASE_URL = "https://tcstudentserver-production.up.railway.app"; // The URL for your main server (server.js)
const PROD_LESSON_SERVER_URL =
  "https://tclessonserver-production.up.railway.app"; // The URL for your lesson server

const API_BASE_URL = isProduction ? PROD_API_BASE_URL : "http://localhost:3000";
const LESSON_SERVER_URL = isProduction
  ? PROD_LESSON_SERVER_URL
  : "http://localhost:4000";

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
      `${API_BASE_URL}/messages/${teacherUsername}`
    );
    const response = await fetch(`${API_BASE_URL}/messages/${teacherUsername}`);

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
  // Hide loading spinner and show sign-on dialog by default
  hideLoadingSpinner();

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

      // Show loading spinner during authentication
      showLoadingSpinner("Authenticating...", "Verifying credentials");

      try {
        const hashedPin = await hashPin(pin);
        const response = await fetch(`${API_BASE_URL}/findTeacher`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parcel: [username, hashedPin],
            userType: "teacher",
          }),
        });
        if (response.ok) {
          const data = await response.json();
          const teacherName = data.teacherName || username;

          window.activeTeacherUsername = username;
          window.activeTeacherName = teacherName;

          // Identify with both servers
          socket.emit("identify", teacherName);
          lessonSocket.emit("identify", teacherName);

          signOnDialog.close();

          document
            .querySelector(".dashboard")
            ?.classList.remove("hidden-until-login");
          document
            .querySelector(".navbar")
            ?.classList.remove("hidden-until-login");

          const navbarText = document.querySelector(".navbar-text");
          if (navbarText) {
            navbarText.textContent = teacherName;

            // Add master teacher indicator if this is admin@trinity-capital.net
            if (teacherName === "admin@trinity-capital.net") {
              navbarText.innerHTML = `${teacherName} <span title="Master Teacher - Your content becomes the default for all students" style="color: #ffd700; font-size: 1.2em;">👑</span>`;
            }
          }

          // Update loading message
          showLoadingSpinner(
            "Loading Dashboard...",
            "Setting up your workspace"
          );

          loadTeacherStudents(username);
          initializeMessaging(teacherName);
          loadTeacherLessons(teacherName);

          // --- FETCH EMAIL SETTINGS AND POPULATE ---
          fetch(`${API_BASE_URL}/emailSettings/${username}`)
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

              // Hide loading spinner after everything is loaded
              setTimeout(() => {
                hideLoadingSpinner();
              }, 500); // Small delay to ensure smooth transition
            })
            .catch((err) => {
              window.addressBook = [];
              window.emailTemplates = [];
              window.emailGroups = [];
              renderAddressBook();
              renderEmailTemplates();
              renderGroups();

              // Hide loading spinner even on error
              setTimeout(() => {
                hideLoadingSpinner();
              }, 500);
            });
        } else {
          hideLoadingSpinner();
          errorDiv.textContent = "Invalid username or PIN.";
        }
      } catch (err) {
        hideLoadingSpinner();
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
    // Clear pending lesson changes when closing any dialog
    if (window.pendingLessonChanges) {
      window.pendingLessonChanges.clear();
      console.log("Cleared pending lesson changes on dialog close");
    }

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
      /*
      ====================================================================
      COMPREHENSIVE LESSON BUILDER WITH TRINITY CAPITAL APP INTEGRATION
      ====================================================================
      
      This enhanced lesson creation modal now includes extensive conditionals 
      that leverage ALL features of the Trinity Capital student app:
      
      STUDENT APP FEATURES COVERED:
      • Account Management (Checking/Savings switching, balance tracking)
      • Money Transfers (between accounts)
      • Bills & Payments (recurring with various frequencies)
      • Check Deposits (with validation)
      • Peer-to-Peer Money Transfers
      • Budget Analysis & Income/Expense Tracking
      • Time Travel Financial Simulation
      • Student Messaging System
      • Loan System
      
      CONDITIONAL CATEGORIES AVAILABLE:
      1. Account Balance Conditions - Track and respond to balance changes
      2. Transaction Activity - Monitor student financial actions
      3. Bills & Budget Management - Assess financial planning skills
      4. Account Usage Patterns - Understand account preferences
      5. Time & Engagement - Track lesson interaction
      6. Social & Communication - Monitor peer interactions
      7. Financial Literacy Behaviors - Evaluate real-world skills
      
      ACTION CATEGORIES AVAILABLE:
      1. Educational Actions - Provide learning content
      2. Interactive Challenges - Task-based learning
      3. Account Actions - Simulate transactions
      4. Feedback & Guidance - Personalized responses
      5. Lesson Flow - Control progression
      
      This system ensures lessons are interactive and require students to 
      actively use the Trinity Capital app features to learn financial literacy.
      */

      // --- HTML Structure for the Lesson Builder ---
      const content = `
      <div class="lesson-modal-layout">
        <div class="lesson-modal-container">
          <form id="createLessonForm" class="lesson-form-main">
            <div class="form-group">
              <label for="lessonTitle">Lesson Title</label>
              <input type="text" id="lessonTitle" class="dialog-input" placeholder="e.g., Introduction to Budgeting" required />
            </div>
            <div class="form-group">
              <label for="lessonDescription">Lesson Description</label>
              <textarea id="lessonDescription" class="dialog-textarea" placeholder="Brief description of what students will learn..." rows="2"></textarea>
            </div>

            <!-- Introductory Content Blocks Section -->
            <div class="lesson-builder-section">
              <h6 class="dialog-section-title">Introductory Content</h6>
              <div id="introBlocksContainer"></div>
              <div class="block-controls">
                <button type="button" id="addHeaderBtn" class="btn btn-modal-action">+ Header</button>
                <button type="button" id="addTextBtn" class="btn btn-modal-action">+ Text</button>
                <button type="button" id="addVideoBtn" class="btn btn-modal-action">+ Video</button>
              </div>
            </div>

            <!-- Conditional Actions Section -->
            <div class="lesson-builder-section">
              <h6 class="dialog-section-title">Conditional Actions</h6>
              <div id="conditionsContainer"></div>
              <div class="block-controls">
                <button type="button" id="addConditionBtn" class="btn btn-modal-action">+ Add Condition</button>
                <button type="button" id="addTemplateBtn" class="btn btn-modal-action btn-secondary">+ Use Template</button>
              </div>
              <!-- Template Selection (hidden by default) -->
              <div id="templateSelector" style="display: none; margin-top: 1em; background: rgba(0,0,0,0.2); padding: 1em; border-radius: 8px;">
                <h6 class="dialog-section-title" style="color: #fff; margin-top: 0;">Common Teaching Scenarios</h6>
                <select id="templateDropdown" class="dialog-input">
                  <option value="">-- Select a teaching scenario --</option>
                </select>
                <div id="templateDescription" style="margin: 0.5em 0; color: #ccc; font-style: italic;"></div>
                <div class="block-controls" style="justify-content: flex-end;">
                  <button type="button" id="cancelTemplateBtn" class="btn btn-modal-action btn-secondary">Cancel</button>
                  <button type="button" id="applyTemplateBtn" class="btn btn-modal-action" disabled>Apply Template</button>
                </div>
              </div>
            </div>
          </form>

          <div class="lesson-actions-panel">
            <h5 class="dialog-section-title">Lesson Settings</h5>
             <div class="form-group">
              <label for="unitSelector">Assign to Unit</label>
              <select id="unitSelector" class="dialog-input">
                <option value="">-- No Unit Selected --</option>
                <!-- Options will be populated dynamically -->
              </select>
            </div>
            <button type="button" id="createUnitBtn" class="btn btn-modal-action" style="width: 100%;">+ Create New Unit</button>
            
            <!-- Edit Lesson Block -->
            <div class="lesson-builder-section" style="margin-top: 2em; padding-top: 1em; border-top: 1px solid rgba(255,255,255,0.2);">
              <h6 class="dialog-section-title">Edit Existing Lesson</h6>
              <div class="form-group">
                <label for="editLessonSelector">Select Lesson to Edit</label>
                <select id="editLessonSelector" class="dialog-input">
                  <option value="">-- Select a lesson to edit --</option>
                  <!-- Options will be populated dynamically -->
                </select>
              </div>
              <button type="button" id="editLessonBtn" class="btn btn-modal-action" style="width: 100%;" disabled>Edit Selected Lesson</button>
            </div>
            
            <!-- Form for creating a unit, hidden by default -->
            <div id="createUnitContainer" style="display: none; margin-top: 1em; background: rgba(0,0,0,0.2); padding: 1em; border-radius: 8px;">
              <h6 class="dialog-section-title" style="color: #fff; margin-top: 0;">New Unit Details</h6>
              <div class="form-group">
                <label for="newUnitNumber">Unit Number</label>
                <input type="number" id="newUnitNumber" class="dialog-input" placeholder="e.g., 2" min="1" required />
              </div>
              <div class="form-group">
                <label for="newUnitName">Unit Name</label>
                <input type="text" id="newUnitName" class="dialog-input" placeholder="e.g., Advanced Saving" required />
              </div>
              <div class="block-controls" style="justify-content: flex-end;">
                <button type="button" id="cancelNewUnitBtn" class="btn btn-modal-action btn-secondary">Cancel</button>
                <button type="button" id="saveNewUnitBtn" class="btn btn-modal-action">Save Unit</button>
              </div>
            </div>

            <button type="button" id="assignToClassBtn" class="btn btn-modal-action">Assign to Class</button>
          </div>
        </div>
        <div class="lesson-modal-footer">
            <button type="button" id="debugLessonBtn" class="btn btn-modal-action" style="background-color: #ff9800;">Debug Lesson Data</button>
            <button type="button" id="uploadToWhirlpoolBtn" class="btn btn-modal-action">Upload to Whirlpool</button>
            <button type="submit" form="createLessonForm" id="saveLessonBtn" class="btn">Save Lesson</button>
        </div>
      </div>
    `;

      window.openGlobalDialog("Create Lesson", "");
      const dialogContent = document.getElementById("dialogContent");
      dialogContent.innerHTML = content;

      populateUnitSelector();

      // Populate edit lesson selector
      populateEditLessonSelector();

      const introBlocksContainer = document.getElementById(
        "introBlocksContainer"
      );
      const conditionsContainer = document.getElementById(
        "conditionsContainer"
      );

      // --- Block & Condition Creation Functions ---
      const createBlock = (type) => {
        const block = document.createElement("div");
        block.className = "content-block";
        block.dataset.blockType = type;
        let innerHTML = `<button type="button" class="remove-btn">&times;</button>`;
        switch (type) {
          case "header":
            innerHTML += `<label>Header</label><input type="text" class="dialog-input" placeholder="Enter header text...">`;
            break;
          case "text":
            innerHTML += `<label>Text Block</label><textarea class="dialog-textarea" placeholder="Enter paragraph text..."></textarea>`;
            break;
          case "video":
            // Changed input type to "text" to allow for iframe code. Added a preview container.
            innerHTML += `<label>Video URL or YouTube Embed</label><input type="text" class="dialog-input video-url-input" placeholder="e.g., https://www.youtube.com/watch?v=... or .mp4 URL">
            <div class="video-preview-container" style="margin-top: 0.5em; display: none;"></div>`;
            break;
        }
        block.innerHTML = innerHTML;
        introBlocksContainer.appendChild(block);
      };

      const createCondition = () => {
        const condition = document.createElement("div");
        condition.className = "condition-block";
        condition.innerHTML = `
          <button type="button" class="remove-btn">&times;</button>
          <div class="form-group">
            <label>If</label>
            <select class="dialog-input condition-type">
              <optgroup label="Account Balance Conditions">
                <option value="bank_balance_above">Total Balance Is Above</option>
                <option value="bank_balance_below">Total Balance Is Below</option>
                <option value="checking_balance_above">Checking Balance Is Above</option>
                <option value="checking_balance_below">Checking Balance Is Below</option>
                <option value="savings_balance_above">Savings Balance Is Above</option>
                <option value="savings_balance_below">Savings Balance Is Below</option>
                <option value="balance_ratio_savings_above">Savings to Checking Ratio Above</option>
              </optgroup>
              <optgroup label="Transaction Activity">
                <option value="transfer_completed">Student Completes a Transfer</option>
                <option value="transfer_amount_above">Transfer Amount Is Above</option>
                <option value="deposit_completed">Student Makes a Deposit</option>
                <option value="deposit_amount_above">Deposit Amount Is Above</option>
                <option value="money_sent">Student Sends Money to Peer</option>
                <option value="money_received">Student Receives Money from Peer</option>
                <option value="total_transactions_above">Total Transactions Above</option>
              </optgroup>
              <optgroup label="Bills & Budget Management">
                <option value="bill_created">Student Creates a Bill</option>
                <option value="payment_created">Student Creates a Payment/Income</option>
                <option value="total_bills_above">Total Monthly Bills Above</option>
                <option value="total_income_above">Total Monthly Income Above</option>
                <option value="budget_negative">Budget Shows Negative (Spending > Income)</option>
                <option value="budget_positive_above">Budget Surplus Above</option>
                <option value="bills_count_above">Number of Bills Above</option>
                <option value="income_count_above">Number of Income Sources Above</option>
              </optgroup>
              <optgroup label="Account Usage Patterns">
                <option value="account_switched">Student Switches Between Accounts</option>
                <option value="checking_used_more">Uses Checking More Than Savings</option>
                <option value="savings_used_more">Uses Savings More Than Checking</option>
                <option value="account_type_active">Currently Viewing Account Type</option>
              </optgroup>
              <optgroup label="Time & Engagement">
                <option value="elapsed_time">Time in Lesson (Seconds)</option>
                <option value="lesson_revisited">Student Returns to Lesson</option>
                <option value="lesson_completion_trigger">Lesson Completion Trigger</option>
              </optgroup>
              <optgroup label="SMART Goals & Planning">
                <option value="goal_set_specific">Student Sets Specific Goal</option>
                <option value="goal_set_measurable">Student Sets Measurable Goal</option>
                <option value="goal_has_deadline">Goal Has Time-bound Deadline</option>
                <option value="goal_progress_tracked">Goal Progress Is Tracked</option>
                <option value="smart_goal_completed">SMART Goal Fully Completed</option>
                <option value="goal_savings_amount_set">Savings Goal Amount Set</option>
                <option value="goal_timeline_realistic">Goal Timeline Is Realistic</option>
                <option value="multiple_goals_active">Multiple Goals Are Active</option>
              </optgroup>
              <optgroup label="Social & Communication">
                <option value="message_sent">Student Sends a Message</option>
                <option value="message_received">Student Receives a Message</option>
                <option value="classmate_interaction">Interacts with Specific Classmate</option>
              </optgroup>
              <optgroup label="Financial Literacy Behaviors">
                <option value="loan_taken">Student Takes a Loan</option>
                <option value="loan_amount_above">Loan Amount Above</option>
                <option value="savings_goal_met">Achieves Savings Goal</option>
                <option value="emergency_fund_built">Builds Emergency Fund (3+ months expenses)</option>
                <option value="debt_to_income_high">Debt-to-Income Ratio Above</option>
              </optgroup>
            </select>
            <input type="number" class="dialog-input condition-value" placeholder="Value" style="max-width: 100px;">
          </div>
          <div class="form-group">
            <label>Then</label>
            <select class="dialog-input action-type">
              <optgroup label="Educational Actions">
                <option value="send_message">Send Educational Message</option>
                <option value="add_text_block">Add Text Block</option>
                <option value="show_tip">Show Financial Tip</option>
                <option value="highlight_feature">Highlight App Feature</option>
                <option value="suggest_action">Suggest Next Action</option>
              </optgroup>
              <optgroup label="Interactive Challenges">
                <option value="challenge_transfer">Challenge: Make a Transfer</option>
                <option value="challenge_deposit">Challenge: Make a Deposit</option>
                <option value="challenge_create_bill">Challenge: Set Up a Bill</option>
                <option value="challenge_create_income">Challenge: Add Income Source</option>
                <option value="challenge_save_amount">Challenge: Save Specific Amount</option>
                <option value="challenge_send_money">Challenge: Send Money to Classmate</option>
                <option value="challenge_budget_balance">Challenge: Balance Your Budget</option>
              </optgroup>
              <optgroup label="Account Actions">
                <option value="force_account_switch">Force Switch to Account Type</option>
                <option value="add_virtual_transaction">Add Virtual Transaction</option>
                <option value="add_sample_bill">Add Sample Bill</option>
                <option value="add_sample_income">Add Sample Income</option>
              </optgroup>
              <optgroup label="Feedback & Guidance">
                <option value="praise_good_habit">Praise Financial Habit</option>
                <option value="warn_poor_choice">Warn About Poor Choice</option>
                <option value="explain_consequence">Explain Financial Consequence</option>
                <option value="show_calculation">Show Budget Calculation</option>
                <option value="compare_to_peers">Compare to Class Average</option>
              </optgroup>
              <optgroup label="SMART Goal Actions">
                <option value="validate_smart_goal">Validate SMART Goal Criteria</option>
                <option value="guide_goal_improvement">Guide Goal Improvement</option>
                <option value="congratulate_smart_goal">Congratulate SMART Goal</option>
              </optgroup>
              <optgroup label="Lesson Flow">
                <option value="restart_student">Restart Lesson</option>
                <option value="advance_to_section">Advance to Lesson Section</option>
                <option value="require_completion">Require Task Completion</option>
                <option value="complete_lesson">Complete Lesson & Calculate Score</option>
                <option value="unlock_feature">Unlock App Feature</option>
              </optgroup>
            </select>
          </div>
          <div class="action-details"></div>
        `;
        conditionsContainer.appendChild(condition);
      };

      const updateActionDetails = (actionSelect) => {
        const detailsContainer = actionSelect
          .closest(".condition-block")
          .querySelector(".action-details");
        const actionType = actionSelect.value;
        let detailsHTML = "";

        switch (actionType) {
          case "send_message":
          case "add_text_block":
          case "show_tip":
          case "explain_consequence":
          case "praise_good_habit":
          case "warn_poor_choice":
            detailsHTML = `<textarea class="dialog-textarea action-content" placeholder="Enter message content..."></textarea>`;
            break;

          case "highlight_feature":
            detailsHTML = `
              <select class="dialog-input action-content">
                <option value="">Select feature to highlight</option>
                <option value="transfer">Transfer Money</option>
                <option value="bills">Bills & Payments</option>
                <option value="deposit">Make Deposit</option>
                <option value="send_money">Send Money</option>
                <option value="account_switch">Switch Accounts</option>
                <option value="budget_analysis">Budget Analysis</option>
              </select>`;
            break;

          case "suggest_action":
            detailsHTML = `
              <select class="dialog-input action-content">
                <option value="">Select suggested action</option>
                <option value="make_transfer">Make a transfer to savings</option>
                <option value="create_bill">Set up a recurring bill</option>
                <option value="add_income">Add an income source</option>
                <option value="check_budget">Review your budget</option>
                <option value="save_more">Increase your savings</option>
                <option value="reduce_spending">Look for ways to reduce spending</option>
                <option value="send_money">Send money to a classmate</option>
              </select>`;
            break;

          case "challenge_transfer":
          case "challenge_save_amount":
            detailsHTML = `
              <input type="number" class="dialog-input action-amount" placeholder="Challenge amount" />
              <select class="dialog-input action-content">
                <option value="checking">To/From Checking</option>
                <option value="savings">To/From Savings</option>
                <option value="either">Either Account</option>
              </select>`;
            break;

          case "challenge_deposit":
            detailsHTML = `
              <input type="number" class="dialog-input action-amount" placeholder="Minimum deposit amount" />
              <input type="text" class="dialog-input action-content" placeholder="Payee/Source name (optional)" />`;
            break;

          case "challenge_create_bill":
          case "challenge_create_income":
            detailsHTML = `
              <input type="text" class="dialog-input action-content" placeholder="Suggested bill/income name" />
              <select class="dialog-input action-frequency">
                <option value="">Any frequency</option>
                <option value="weekly">Weekly</option>
                <option value="bi-weekly">Bi-weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>`;
            break;

          case "challenge_send_money":
            detailsHTML = `
              <input type="number" class="dialog-input action-amount" placeholder="Amount to send" />
              <input type="text" class="dialog-input action-content" placeholder="Specific classmate (optional)" />`;
            break;

          case "force_account_switch":
            detailsHTML = `
              <select class="dialog-input action-content">
                <option value="checking">Switch to Checking</option>
                <option value="savings">Switch to Savings</option>
              </select>`;
            break;

          case "add_virtual_transaction":
            detailsHTML = `
              <input type="number" class="dialog-input action-amount" placeholder="Amount (negative for expense)" />
              <input type="text" class="dialog-input action-content" placeholder="Transaction description" />
              <select class="dialog-input action-frequency">
                <option value="checking">Add to Checking</option>
                <option value="savings">Add to Savings</option>
              </select>`;
            break;

          case "add_sample_bill":
            detailsHTML = `
              <input type="text" class="dialog-input action-content" placeholder="Bill name (e.g., Electric Bill)" />
              <input type="number" class="dialog-input action-amount" placeholder="Amount" />
              <select class="dialog-input action-frequency">
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="bi-weekly">Bi-weekly</option>
                <option value="yearly">Yearly</option>
              </select>`;
            break;

          case "add_sample_income":
            detailsHTML = `
              <input type="text" class="dialog-input action-content" placeholder="Income name (e.g., Part-time Job)" />
              <input type="number" class="dialog-input action-amount" placeholder="Amount" />
              <select class="dialog-input action-frequency">
                <option value="bi-weekly">Bi-weekly</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>`;
            break;

          case "show_calculation":
            detailsHTML = `
              <select class="dialog-input action-content">
                <option value="budget_summary">Budget Summary (Income vs Expenses)</option>
                <option value="savings_rate">Savings Rate Calculation</option>
                <option value="debt_ratio">Debt-to-Income Ratio</option>
                <option value="emergency_fund">Emergency Fund Progress</option>
                <option value="account_growth">Account Balance Growth</option>
              </select>`;
            break;

          case "compare_to_peers":
            detailsHTML = `
              <select class="dialog-input action-content">
                <option value="savings_balance">Compare Savings Balance</option>
                <option value="spending_habits">Compare Spending Habits</option>
                <option value="income_sources">Compare Income Sources</option>
                <option value="transfer_frequency">Compare Transfer Activity</option>
                <option value="bill_management">Compare Bill Management</option>
              </select>`;
            break;

          case "advance_to_section":
            detailsHTML = `
              <input type="text" class="dialog-input action-content" placeholder="Section name or number" />`;
            break;

          case "require_completion":
            detailsHTML = `
              <select class="dialog-input action-content">
                <option value="make_transfer">Complete a transfer</option>
                <option value="make_deposit">Complete a deposit</option>
                <option value="create_bill">Set up a bill</option>
                <option value="create_income">Add income source</option>
                <option value="send_money">Send money to classmate</option>
                <option value="switch_accounts">Switch between accounts</option>
              </select>
              <textarea class="dialog-textarea action-description" placeholder="Instructions for student..."></textarea>`;
            break;

          case "unlock_feature":
            detailsHTML = `
              <select class="dialog-input action-content">
                <option value="peer_transfers">Peer-to-Peer Transfers</option>
                <option value="advanced_budgeting">Advanced Budget Analysis</option>
                <option value="loan_system">Loan System</option>
              </select>
              <textarea class="dialog-textarea action-description" placeholder="Unlock message for student..."></textarea>`;
            break;

          case "complete_lesson":
            detailsHTML = `
              <div class="lesson-completion-config">
                <label>Completion Message:</label>
                <textarea class="dialog-textarea action-content" placeholder="Congratulations message for student..."></textarea>
                
                <label>Scoring Configuration:</label>
                <div class="scoring-options">
                  <div class="score-setting">
                    <label>Base Score:</label>
                    <input type="number" class="dialog-input base-score" placeholder="85" min="50" max="100" value="85" />
                    <small>Starting score before condition bonuses/penalties (50-100 range)</small>
                  </div>
                  
                  <div class="score-setting">
                    <label>Positive Condition Bonus:</label>
                    <input type="number" class="dialog-input positive-bonus" placeholder="3" min="1" max="10" value="3" />
                    <small>Points added for each positive condition met (max 10 per condition)</small>
                  </div>
                  
                  <div class="score-setting">
                    <label>Negative Condition Penalty:</label>
                    <input type="number" class="dialog-input negative-penalty" placeholder="5" min="1" max="15" value="5" />
                    <small>Points subtracted for each negative condition triggered (max 15 per condition)</small>
                  </div>
                  
                  <div class="score-setting">
                    <label>Activity Completion Weight:</label>
                    <input type="number" class="dialog-input quiz-weight" placeholder="25" min="10" max="40" value="25" />
                    <small>Percentage of final score from activity/quiz completion (10-40%)</small>
                  </div>
                  
                  <div class="score-setting">
                    <label>Grade Scale:</label>
                    <select class="dialog-input grade-scale">
                      <option value="standard">Standard (90-100=A, 80-89=B, 70-79=C, 60-69=D, <60=F)</option>
                      <option value="plus-minus">Plus/Minus (A+ 97-100, A 93-96, A- 90-92, etc.)</option>
                      <option value="custom">Custom Scale</option>
                    </select>
                    <small>High school grading scale for score interpretation</small>
                  </div>
                </div>
              </div>`;
            break;

          case "validate_smart_goal":
            detailsHTML = `
              <select class="dialog-input action-content">
                <option value="">Select SMART validation criteria</option>
                <option value="specific">Check if goal is Specific</option>
                <option value="measurable">Check if goal is Measurable</option>
                <option value="achievable">Check if goal is Achievable</option>
                <option value="relevant">Check if goal is Relevant</option>
                <option value="timebound">Check if goal is Time-bound</option>
                <option value="all_criteria">Validate all SMART criteria</option>
              </select>
              <textarea class="dialog-textarea action-description" placeholder="Message to show based on validation result..."></textarea>`;
            break;

          case "guide_goal_improvement":
            detailsHTML = `
              <textarea class="dialog-textarea action-content" placeholder="Guidance message for improving the goal..."></textarea>
              <select class="dialog-input action-focus">
                <option value="">Focus on specific SMART element</option>
                <option value="specific">Help make goal more Specific</option>
                <option value="measurable">Help make goal more Measurable</option>
                <option value="achievable">Help make goal more Achievable</option>
                <option value="relevant">Help make goal more Relevant</option>
                <option value="timebound">Help add Time-bound deadline</option>
              </select>`;
            break;

          case "congratulate_smart_goal":
            detailsHTML = `
              <textarea class="dialog-textarea action-content" placeholder="Congratulations message for setting a good SMART goal..."></textarea>`;
            break;

          default:
            detailsHTML = "";
        }

        detailsContainer.innerHTML = detailsHTML;
      };

      // --- Conditional Templates for Common Teaching Scenarios ---
      const getConditionalTemplates = () => {
        return {
          beginner_savings: {
            name: "Beginner: Encourage Savings",
            description: "Motivate students to transfer money to savings",
            condition: { type: "savings_balance_below", value: 100 },
            action: {
              type: "challenge_transfer",
              amount: 50,
              content: "savings",
            },
          },
          budget_awareness: {
            name: "Budget Awareness: High Spending",
            description: "Alert when students spend more than they earn",
            condition: { type: "budget_negative", value: 0 },
            action: {
              type: "warn_poor_choice",
              content:
                "Your spending exceeds your income! This can lead to debt. Let's review your budget.",
            },
          },
          emergency_fund: {
            name: "Emergency Fund Goal",
            description: "Guide students to build emergency savings",
            condition: { type: "savings_balance_above", value: 500 },
            action: {
              type: "praise_good_habit",
              content:
                "Great job building your emergency fund! Financial experts recommend 3-6 months of expenses.",
            },
          },
          bill_management: {
            name: "Bill Management Training",
            description: "Ensure students set up recurring bills",
            condition: { type: "bills_count_above", value: 0 },
            action: { type: "show_calculation", content: "budget_summary" },
          },
          peer_learning: {
            name: "Peer Collaboration",
            description: "Encourage students to send money to classmates",
            condition: { type: "money_sent", value: 1 },
            action: {
              type: "add_text_block",
              content:
                "You've learned about peer-to-peer transfers! This is how services like Venmo and PayPal work.",
            },
          },
          balanced_accounts: {
            name: "Account Balance Training",
            description: "Teach proper checking vs savings usage",
            condition: { type: "checking_used_more", value: 1 },
            action: { type: "suggest_action", content: "save_more" },
          },
          loan_awareness: {
            name: "Loan Consequences",
            description: "Educate about debt and interest",
            condition: { type: "loan_taken", value: 1 },
            action: {
              type: "add_text_block",
              content:
                "Remember: loans must be repaid with interest. Only borrow what you can afford to repay!",
            },
          },
          smart_goal_mastery: {
            name: "SMART Goal Mastery Training",
            description:
              "Complete SMART goal setting and validation lesson with multiple checkpoints",
            conditions: [
              {
                condition: { type: "goal_set_specific", value: 1 },
                action: {
                  type: "validate_smart_goal",
                  content: "specific",
                  description: "Checking if your goal is specific enough...",
                },
              },
              {
                condition: { type: "goal_set_measurable", value: 1 },
                action: {
                  type: "validate_smart_goal",
                  content: "measurable",
                  description:
                    "Validating that your goal has measurable targets...",
                },
              },
              {
                condition: { type: "goal_has_deadline", value: 1 },
                action: {
                  type: "validate_smart_goal",
                  content: "timebound",
                  description:
                    "Excellent! You've set a deadline for your goal.",
                },
              },
              {
                condition: { type: "goal_progress_tracked", value: 1 },
                action: {
                  type: "congratulate_smart_goal",
                  content:
                    "Great job tracking your progress! This shows commitment to achieving your goal.",
                },
              },
              {
                condition: { type: "goal_savings_amount_set", value: 1 },
                action: {
                  type: "validate_smart_goal",
                  content: "all_criteria",
                  description:
                    "Analyzing your savings goal against all SMART criteria...",
                },
              },
              {
                condition: { type: "goal_timeline_realistic", value: 1 },
                action: {
                  type: "congratulate_smart_goal",
                  content:
                    "Your timeline appears realistic and achievable. Well planned!",
                },
              },
              {
                condition: { type: "smart_goal_completed", value: 1 },
                action: {
                  type: "complete_lesson",
                  content:
                    "🎉 Congratulations! You've mastered SMART goal setting! Your goals are Specific, Measurable, Achievable, Relevant, and Time-bound.",
                  baseScore: 85,
                  positiveBonus: 8,
                  negativePenalty: 4,
                  quizWeight: 25,
                },
              },
              {
                condition: { type: "multiple_goals_active", value: 1 },
                action: {
                  type: "congratulate_smart_goal",
                  content:
                    "Impressive! Managing multiple SMART goals shows advanced financial planning skills.",
                },
              },
            ],
          },
        };
      };

      // --- Event Listeners ---
      document
        .getElementById("addHeaderBtn")
        .addEventListener("click", () => createBlock("header"));
      document
        .getElementById("addTextBtn")
        .addEventListener("click", () => createBlock("text"));
      document
        .getElementById("addVideoBtn")
        .addEventListener("click", () => createBlock("video"));
      document
        .getElementById("addConditionBtn")
        .addEventListener("click", createCondition);

      // --- Template Functionality ---
      const templates = getConditionalTemplates();
      const templateDropdown = document.getElementById("templateDropdown");
      const templateDescription = document.getElementById(
        "templateDescription"
      );
      const templateSelector = document.getElementById("templateSelector");

      // Populate template dropdown
      Object.keys(templates).forEach((key) => {
        const option = document.createElement("option");
        option.value = key;
        option.textContent = templates[key].name;
        templateDropdown.appendChild(option);
      });

      // Template button handlers
      document
        .getElementById("addTemplateBtn")
        .addEventListener("click", () => {
          templateSelector.style.display = "block";
        });

      document
        .getElementById("cancelTemplateBtn")
        .addEventListener("click", () => {
          templateSelector.style.display = "none";
          templateDropdown.value = "";
          templateDescription.textContent = "";
        });

      templateDropdown.addEventListener("change", (e) => {
        const selectedTemplate = templates[e.target.value];
        if (selectedTemplate) {
          templateDescription.textContent = selectedTemplate.description;
          document.getElementById("applyTemplateBtn").disabled = false;
        } else {
          templateDescription.textContent = "";
          document.getElementById("applyTemplateBtn").disabled = true;
        }
      });

      document
        .getElementById("applyTemplateBtn")
        .addEventListener("click", () => {
          const selectedTemplate = templates[templateDropdown.value];
          if (selectedTemplate) {
            // Check if this is a multi-condition template (like SMART goals)
            if (
              selectedTemplate.conditions &&
              Array.isArray(selectedTemplate.conditions)
            ) {
              // Handle multi-condition template
              selectedTemplate.conditions.forEach((conditionData, index) => {
                createCondition();

                // Get the newly created condition block (last one)
                const conditionBlocks = document.querySelectorAll(
                  "#conditionsContainer .condition-block"
                );
                const newBlock = conditionBlocks[conditionBlocks.length - 1];

                // Populate the condition
                const conditionSelect =
                  newBlock.querySelector(".condition-type");
                const conditionValue =
                  newBlock.querySelector(".condition-value");
                const actionSelect = newBlock.querySelector(".action-type");

                conditionSelect.value = conditionData.condition.type;
                conditionValue.value = conditionData.condition.value;
                actionSelect.value = conditionData.action.type;

                // Trigger the action details update
                updateActionDetails(actionSelect);

                // Populate action details with a slight delay for DOM updates
                setTimeout(() => {
                  const actionContent =
                    newBlock.querySelector(".action-content");
                  const actionAmount = newBlock.querySelector(".action-amount");
                  const actionDescription = newBlock.querySelector(
                    ".action-description"
                  );
                  const baseScore = newBlock.querySelector(".base-score");
                  const positiveBonus =
                    newBlock.querySelector(".positive-bonus");
                  const negativePenalty =
                    newBlock.querySelector(".negative-penalty");
                  const quizWeight = newBlock.querySelector(".quiz-weight");

                  if (actionContent && conditionData.action.content) {
                    actionContent.value = conditionData.action.content;
                  }
                  if (actionAmount && conditionData.action.amount) {
                    actionAmount.value = conditionData.action.amount;
                  }
                  if (actionDescription && conditionData.action.description) {
                    actionDescription.value = conditionData.action.description;
                  }

                  // Handle lesson completion specific fields
                  if (baseScore && conditionData.action.baseScore) {
                    baseScore.value = conditionData.action.baseScore;
                  }
                  if (positiveBonus && conditionData.action.positiveBonus) {
                    positiveBonus.value = conditionData.action.positiveBonus;
                  }
                  if (negativePenalty && conditionData.action.negativePenalty) {
                    negativePenalty.value =
                      conditionData.action.negativePenalty;
                  }
                  if (quizWeight && conditionData.action.quizWeight) {
                    quizWeight.value = conditionData.action.quizWeight;
                  }
                }, 100 + index * 50); // Stagger the timeouts for multiple conditions
              });
            } else {
              // Handle single-condition template (legacy format)
              createCondition();

              // Get the newly created condition block (last one)
              const conditionBlocks = document.querySelectorAll(
                "#conditionsContainer .condition-block"
              );
              const newBlock = conditionBlocks[conditionBlocks.length - 1];

              // Populate the condition
              const conditionSelect = newBlock.querySelector(".condition-type");
              const conditionValue = newBlock.querySelector(".condition-value");
              const actionSelect = newBlock.querySelector(".action-type");

              conditionSelect.value = selectedTemplate.condition.type;
              conditionValue.value = selectedTemplate.condition.value;
              actionSelect.value = selectedTemplate.action.type;

              // Trigger the action details update
              updateActionDetails(actionSelect);

              // Populate action details
              setTimeout(() => {
                const actionContent = newBlock.querySelector(".action-content");
                const actionAmount = newBlock.querySelector(".action-amount");

                if (actionContent && selectedTemplate.action.content) {
                  actionContent.value = selectedTemplate.action.content;
                }
                if (actionAmount && selectedTemplate.action.amount) {
                  actionAmount.value = selectedTemplate.action.amount;
                }
              }, 100);
            }

            // Hide template selector
            templateSelector.style.display = "none";
            templateDropdown.value = "";
            templateDescription.textContent = "";
          }
        });

      // Define event handler functions to avoid duplicates
      function handleDialogClickForLessonCreation(e) {
        if (e.target.classList.contains("remove-btn")) {
          e.target.closest(".content-block, .condition-block").remove();
        }
      }

      function handleDialogChangeForLessonCreation(e) {
        if (e.target.classList.contains("action-type")) {
          updateActionDetails(e.target);
        }
      }

      function handleDialogInputForLessonCreation(e) {
        if (e.target.classList.contains("video-url-input")) {
          const input = e.target;
          const previewContainer = input.nextElementSibling;
          const url = input.value.trim();
          const embedUrl = getYoutubeEmbedUrl(url);

          if (embedUrl) {
            previewContainer.style.display = "block";
            if (embedUrl.includes("youtube.com/embed")) {
              previewContainer.innerHTML = `<iframe width="100%" height="150" src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius: 8px;"></iframe>`;
            } else {
              previewContainer.innerHTML = `<video width="100%" height="150" controls src="${embedUrl}" style="border-radius: 8px;"></video>`;
            }
          } else {
            previewContainer.style.display = "none";
            previewContainer.innerHTML = "";
          }
        }
      }

      // Remove existing event listeners before adding new ones to prevent duplicates
      dialogContent.removeEventListener(
        "click",
        handleDialogClickForLessonCreation
      );
      dialogContent.removeEventListener(
        "change",
        handleDialogChangeForLessonCreation
      );
      dialogContent.removeEventListener(
        "input",
        handleDialogInputForLessonCreation
      );

      // Add the event listeners
      dialogContent.addEventListener(
        "click",
        handleDialogClickForLessonCreation
      );
      dialogContent.addEventListener(
        "change",
        handleDialogChangeForLessonCreation
      );
      dialogContent.addEventListener(
        "input",
        handleDialogInputForLessonCreation
      );

      // --- Auto-assignment helper function ---
      async function autoAssignUnitToStudents(
        selectedUnitValue,
        selectedUnitName
      ) {
        console.log(
          `Auto-assigning unit: ${selectedUnitName} (${selectedUnitValue})`
        );

        if (window.activeTeacherName === "admin@trinity-capital.net") {
          // Admin: assign to all students
          console.log("Admin auto-assignment: assigning to all students");

          try {
            // Fetch all students
            const resp = await fetch(`${API_BASE_URL}/allStudents`);
            let allStudents = [];
            if (resp.ok) {
              allStudents = await resp.json();
            } else {
              throw new Error(`Failed to fetch students: ${resp.status}`);
            }

            if (allStudents.length === 0) {
              console.warn("No students found for auto-assignment");
              return;
            }

            console.log(`Auto-assigning to ${allStudents.length} students`);

            // Assign unit to each student using the main server endpoint that fetches complete lesson content
            let successCount = 0;
            let errorCount = 0;

            for (const studentId of allStudents) {
              try {
                const assignResponse = await fetch(
                  `${API_BASE_URL}/assignUnitToStudent`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      studentId,
                      unitId: selectedUnitValue,
                      unitName: selectedUnitName,
                      assignedBy: "admin@trinity-capital.net",
                    }),
                  }
                );

                if (assignResponse.ok) {
                  successCount++;
                  console.log(
                    `✅ Successfully assigned unit to student ${studentId}`
                  );
                } else {
                  errorCount++;
                  console.error(
                    `Failed to auto-assign unit to student ${studentId}`
                  );
                }
              } catch (error) {
                errorCount++;
                console.error(
                  `Error auto-assigning unit to student ${studentId}:`,
                  error
                );
              }
            }

            console.log(
              `Auto-assignment results: ${successCount} success, ${errorCount} errors`
            );
          } catch (error) {
            console.error("Admin auto-assignment failed:", error);
            throw error;
          }
        } else {
          // Non-admin: assign to all their class periods
          console.log(
            "Teacher auto-assignment: assigning to all class periods"
          );

          const availablePeriods = ["01", "02", "03"];
          let totalSuccess = 0;
          let totalErrors = 0;

          for (const period of availablePeriods) {
            try {
              // Get students in this period
              const resp = await fetch(
                `${API_BASE_URL}/studentsInPeriod/${period}`
              );
              let studentsInPeriod = [];
              if (resp.ok) {
                studentsInPeriod = await resp.json();
              } else {
                console.warn(
                  `Failed to fetch students in period ${period}: ${resp.status}`
                );
                continue;
              }

              if (studentsInPeriod.length === 0) {
                console.log(`No students in period ${period}, skipping`);
                continue;
              }

              console.log(
                `Auto-assigning to ${studentsInPeriod.length} students in period ${period}`
              );

              // Assign unit to each student in period using the main server endpoint
              for (const studentId of studentsInPeriod) {
                try {
                  const assignResponse = await fetch(
                    `${API_BASE_URL}/assignUnitToStudent`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        studentId,
                        unitId: selectedUnitValue,
                        unitName: selectedUnitName,
                        assignedBy: window.activeTeacherName,
                      }),
                    }
                  );

                  if (assignResponse.ok) {
                    totalSuccess++;
                    console.log(
                      `✅ Successfully assigned unit to student ${studentId} in period ${period}`
                    );
                  } else {
                    totalErrors++;
                    console.error(
                      `Failed to auto-assign unit to student ${studentId} in period ${period}`
                    );
                  }
                } catch (error) {
                  totalErrors++;
                  console.error(
                    `Error auto-assigning unit to student ${studentId} in period ${period}:`,
                    error
                  );
                }
              }
            } catch (error) {
              console.error(
                `Error processing period ${period} for auto-assignment:`,
                error
              );
              totalErrors++;
            }
          }

          console.log(
            `Auto-assignment results across all periods: ${totalSuccess} success, ${totalErrors} errors`
          );
        }
      }

      // --- Save/Submit Handler ---
      document
        .getElementById("createLessonForm")
        .addEventListener("submit", async (e) => {
          e.preventDefault();

          console.log("=== LESSON FORM SUBMISSION STARTED ===");
          console.log("Form submitted, preventing default behavior");

          const unitSelector = document.getElementById("unitSelector");
          const selectedUnitValue = unitSelector.value;

          console.log("Unit selector value:", selectedUnitValue);

          if (!selectedUnitValue) {
            console.warn("No unit selected, aborting submission");
            alert("Please select a unit before saving the lesson.");
            return; // Prevent server call if no unit is selected
          }

          const selectedUnitName =
            unitSelector.options[unitSelector.selectedIndex].text;

          console.log("Selected unit name:", selectedUnitName);

          const lessonData = {
            lesson_title: document.getElementById("lessonTitle").value,
            lesson_description:
              document.getElementById("lessonDescription")?.value || "",
            lesson_blocks: [], // This will be the intro_text_blocks
            lesson_conditions: [], // This will be the conditions
          };

          console.log("Initial lesson data structure:", lessonData);

          // Collect intro blocks
          const introBlocks = document.querySelectorAll(
            "#introBlocksContainer .content-block"
          );
          console.log("Found intro blocks:", introBlocks.length);

          introBlocks.forEach((block, index) => {
            console.log(`Processing intro block ${index + 1}:`, block);
            const type = block.dataset.blockType;
            const input = block.querySelector("input, textarea");
            const blockData = { type };

            console.log(`Block ${index + 1} type:`, type);
            console.log(`Block ${index + 1} input element:`, input);

            if (type === "video") {
              // Use the helper function to get a clean embed URL
              blockData.url = getYoutubeEmbedUrl(input.value);
              console.log(`Block ${index + 1} video URL:`, blockData.url);
            } else {
              blockData.content = input.value;
              console.log(`Block ${index + 1} content:`, blockData.content);
            }
            lessonData.lesson_blocks.push(blockData);
          });

          console.log("Intro blocks found:", introBlocks.length);
          console.log("Lesson blocks collected:", lessonData.lesson_blocks);

          // Collect conditions
          document
            .querySelectorAll("#conditionsContainer .condition-block")
            .forEach((block) => {
              const condition = {
                condition_type: block.querySelector(".condition-type").value,
                value: parseFloat(
                  block.querySelector(".condition-value").value
                ),
                action: {
                  type: block.querySelector(".action-type").value,
                },
              };

              // Collect action content based on action type
              const actionContentEl = block.querySelector(".action-content");
              const actionAmountEl = block.querySelector(".action-amount");
              const actionFrequencyEl =
                block.querySelector(".action-frequency");
              const actionDescriptionEl = block.querySelector(
                ".action-description"
              );

              if (actionContentEl) {
                if (condition.action.type === "add_text_block") {
                  condition.action.block = {
                    type: "text",
                    content: actionContentEl.value,
                  };
                } else {
                  condition.action.content = actionContentEl.value;
                }
              }

              // Add additional parameters for complex actions
              if (actionAmountEl && actionAmountEl.value) {
                condition.action.amount = parseFloat(actionAmountEl.value);
              }

              if (actionFrequencyEl && actionFrequencyEl.value) {
                condition.action.frequency = actionFrequencyEl.value;
              }

              if (actionDescriptionEl && actionDescriptionEl.value) {
                condition.action.description = actionDescriptionEl.value;
              }

              // Add metadata for action categorization
              const actionType = condition.action.type;
              if (actionType.startsWith("challenge_")) {
                condition.action.category = "challenge";
                condition.action.challenge_type = actionType.replace(
                  "challenge_",
                  ""
                );
              } else if (
                ["highlight_feature", "suggest_action", "show_tip"].includes(
                  actionType
                )
              ) {
                condition.action.category = "guidance";
              } else if (
                [
                  "add_virtual_transaction",
                  "add_sample_bill",
                  "add_sample_income",
                ].includes(actionType)
              ) {
                condition.action.category = "simulation";
              } else if (
                [
                  "praise_good_habit",
                  "warn_poor_choice",
                  "explain_consequence",
                ].includes(actionType)
              ) {
                condition.action.category = "feedback";
              } else if (
                [
                  "require_completion",
                  "unlock_feature",
                  "advance_to_section",
                ].includes(actionType)
              ) {
                condition.action.category = "progression";
              }

              lessonData.lesson_conditions.push(condition);
            });

          console.log(
            "Total conditions collected:",
            lessonData.lesson_conditions.length
          );
          console.log("All lesson conditions:", lessonData.lesson_conditions);

          // Construct the final payload
          console.log("Constructing final payload...");
          const parcel = {
            lesson: lessonData,
            unit: {
              value: selectedUnitValue,
              name: selectedUnitName,
            },
            teacher: window.activeTeacherName,
          };

          console.log("Final parcel structure:", parcel);
          console.log("Teacher name:", window.activeTeacherName);
          console.log("Unit details:", parcel.unit);
          console.log("Lesson title:", parcel.lesson.lesson_title);

          // Check if we're editing an existing lesson
          const isEditing = window.editingLessonId;
          if (isEditing) {
            parcel.lessonId = window.editingLessonId;
            console.log("=== UPDATING LESSON ===");
            console.log("Editing Lesson ID:", window.editingLessonId);
            console.log("Lesson Data being sent:", lessonData);
            console.log("Full parcel being sent:", parcel);
          } else {
            console.log("=== CREATING NEW LESSON ===");
            console.log("Lesson Data being sent:", lessonData);
            console.log("Full parcel being sent:", parcel);
          }

          try {
            const endpoint = isEditing
              ? `${LESSON_SERVER_URL}/update-lesson`
              : `${LESSON_SERVER_URL}/save-lesson`;

            console.log(
              `Making ${isEditing ? "UPDATE" : "CREATE"} request to:`,
              endpoint
            );

            const response = await fetch(endpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(parcel),
            });

            console.log("Response status:", response.status);
            console.log("Response ok:", response.ok);

            if (response.ok) {
              const result = await response.json();
              console.log(
                `Lesson ${isEditing ? "updated" : "saved"} successfully:`,
                result
              );

              // Automatically assign unit with complete lesson content after creation
              if (!isEditing) {
                console.log(
                  "Auto-assigning unit with complete lesson content..."
                );

                try {
                  await autoAssignUnitToStudents(
                    selectedUnitValue,
                    selectedUnitName
                  );
                  console.log("Auto-assignment completed successfully");
                } catch (assignError) {
                  console.error("Auto-assignment failed:", assignError);
                  // Don't let assignment failure interfere with lesson save success
                }
              }

              if (isEditing) {
                alert(
                  `Lesson "${lessonData.lesson_title}" updated successfully!`
                );

                // Reset editing state
                window.editingLessonId = null;
                const saveLessonBtn = document.getElementById("saveLessonBtn");
                saveLessonBtn.textContent = "Save Lesson";

                // Refresh lesson data
                if (window.allTeacherLessons) {
                  // Reload lesson data to get updated information
                  loadTeacherLessons(window.activeTeacherName).then(() => {
                    populateEditLessonSelector();
                  });
                }
              } else {
                // Special message for master teacher
                if (window.activeTeacherName === "admin@trinity-capital.net") {
                  alert(
                    "🎉 Master Teacher Lesson Created!\n\n" +
                      "Your lesson has been saved and will now serve as DEFAULT CONTENT for all students and teachers in the system.\n\n" +
                      "All other teachers will automatically inherit this lesson as part of their default curriculum." +
                      "\n\n✅ Unit automatically assigned to all students with complete lesson content!"
                  );
                } else {
                  alert(
                    "Lesson saved successfully! The server has logged the data." +
                      "\n\n✅ Unit automatically assigned to your students with complete lesson content!"
                  );
                }
              }
              // window.closeGlobalDialog(); // You can uncomment this to close the dialog on save
            } else {
              console.error(
                `Failed to ${isEditing ? "update" : "save"} lesson:`,
                response.statusText
              );

              // Try to read error response body
              try {
                const errorData = await response.text();
                console.error("Error response body:", errorData);
              } catch (e) {
                console.error("Could not read error response body:", e);
              }

              alert(
                `Error: Failed to ${
                  isEditing ? "update" : "save"
                } lesson. Status: ${
                  response.status
                }\nCheck console for details.`
              );
            }
          } catch (error) {
            console.error(
              `Error ${isEditing ? "updating" : "sending"} lesson data:`,
              error
            );
            alert(
              `An error occurred while ${
                isEditing ? "updating" : "saving"
              } the lesson. Check the console.`
            );
          }
        });

      // --- Placeholder Listeners for other buttons ---
      const createUnitBtn = document.getElementById("createUnitBtn");
      const createUnitContainer = document.getElementById(
        "createUnitContainer"
      );

      createUnitBtn.addEventListener("click", () => {
        createUnitContainer.style.display = "block";
        createUnitBtn.style.display = "none";
      });

      document
        .getElementById("cancelNewUnitBtn")
        .addEventListener("click", () => {
          createUnitContainer.style.display = "none";
          createUnitBtn.style.display = "block";
          document.getElementById("newUnitNumber").value = "";
          document.getElementById("newUnitName").value = "";
        });

      document
        .getElementById("saveNewUnitBtn")
        .addEventListener("click", () => {
          const unitNumberInput = document.getElementById("newUnitNumber");
          const unitNameInput = document.getElementById("newUnitName");
          const unitSelector = document.getElementById("unitSelector");

          const unitNumber = unitNumberInput.value;
          const unitName = unitNameInput.value.trim();

          if (!unitNumber || !unitName) {
            alert("Please provide both a unit number and a name.");
            return;
          }

          const unitValue = `unit${unitNumber}`;
          const unitText = `Unit ${unitNumber}: ${unitName}`;

          // Check if teacher already has a custom unit with this number
          // (Allow replacing default units, but not duplicating custom units)
          const existingCustomUnit = window.teacherUnits
            ? window.teacherUnits.find(
                (unit) => unit.value === unitValue && !unit.isDefaultUnit
              )
            : null;

          if (existingCustomUnit) {
            alert(
              "You already have a custom unit with this number. Please choose a different number or edit the existing unit."
            );
            return;
          }

          // Check if this will replace a default unit and inform the user
          const existingDefaultUnit = window.teacherUnits
            ? window.teacherUnits.find(
                (unit) => unit.value === unitValue && unit.isDefaultUnit
              )
            : null;

          if (existingDefaultUnit) {
            const confirmed = confirm(
              `This will replace the default "${existingDefaultUnit.name}" with your custom unit "${unitText}". Continue?`
            );
            if (!confirmed) {
              return;
            }
          }

          // Add to the global teacherUnits array - replace any existing unit with same number
          if (!window.teacherUnits) {
            window.teacherUnits = [];
          }

          // Find and remove any existing unit with the same unit number (default or custom)
          const existingUnitIndex = window.teacherUnits.findIndex(
            (unit) => unit.value === unitValue
          );

          if (existingUnitIndex !== -1) {
            // Replace the existing unit (whether default or custom)
            console.log(
              `Replacing existing unit at index ${existingUnitIndex} with new custom unit`
            );
            window.teacherUnits[existingUnitIndex] = {
              value: unitValue,
              name: unitText,
              lessons: [],
              isDefaultUnit: false, // Mark as teacher's own unit
            };
          } else {
            // Add new unit if no existing unit with this number
            window.teacherUnits.push({
              value: unitValue,
              name: unitText,
              lessons: [],
              isDefaultUnit: false, // Mark as teacher's own unit
            });
          }

          // Save the custom unit to the server
          fetch(`${LESSON_SERVER_URL}/create-custom-unit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              teacherName: window.activeTeacherName,
              unitData: {
                value: unitValue,
                name: unitText,
              },
            }),
          })
            .then((response) => response.json())
            .then((result) => {
              if (result.success) {
                console.log("Custom unit saved to server successfully");

                // Update the dropdown - either update existing option or add new one
                let existingOption = Array.from(unitSelector.options).find(
                  (opt) => opt.value === unitValue
                );

                if (existingOption) {
                  // Update existing option with new name
                  existingOption.textContent = unitText;
                  existingOption.selected = true;
                  console.log(
                    `Updated existing dropdown option for ${unitValue}`
                  );
                } else {
                  // Add new option to dropdown
                  const newOption = document.createElement("option");
                  newOption.value = unitValue;
                  newOption.textContent = unitText;
                  unitSelector.appendChild(newOption);
                  newOption.selected = true;
                  console.log(`Added new dropdown option for ${unitValue}`);
                }

                // Hide the form and reset
                document.getElementById("cancelNewUnitBtn").click();

                // Refresh teacher data to ensure proper unit list with defaults
                console.log(
                  "Refreshing teacher data after creating custom unit"
                );
                loadTeacherLessons(window.activeTeacherName).then(() => {
                  console.log(
                    "Teacher data refreshed after custom unit creation"
                  );

                  // Refresh the unit selector dropdown to show all units
                  populateUnitSelector();

                  // If lesson management modal is open, refresh its display
                  if (document.getElementById("assignedUnitsContainer")) {
                    refreshLessonManagementModal();
                  }
                });
              } else {
                console.error("Failed to save custom unit:", result.message);
                alert("Error saving custom unit: " + result.message);
              }
            })
            .catch((error) => {
              console.error("Error saving custom unit:", error);
              alert(
                "Network error while saving custom unit. Please try again."
              );
            });
        });

      document
        .getElementById("assignToClassBtn") // This is the button in the lesson builder
        .addEventListener("click", () => {
          const unitSelector = document.getElementById("unitSelector");
          const selectedUnitValue = unitSelector.value;
          const selectedUnitName =
            unitSelector.options[unitSelector.selectedIndex].text;

          if (!selectedUnitValue) {
            alert("Please select a unit to assign.");
            return;
          }

          // If admin, assign to ALL students, else show period selector
          if (window.activeTeacherName === "admin@trinity-capital.net") {
            // Admin: assign to all students
            window.openGlobalDialog(
              "Assign Unit to All Students",
              `<p>Assigning unit: <strong>${selectedUnitName}</strong> to <strong>ALL STUDENTS</strong></p><button id='confirmAssignBtn' class='btn btn-primary' style='margin-top: 1.5em;'>Confirm Assignment</button>`
            );
            const confirmBtn = document.getElementById("confirmAssignBtn");
            if (confirmBtn) {
              confirmBtn.addEventListener(
                "click",
                async () => {
                  try {
                    confirmBtn.disabled = true;
                    confirmBtn.textContent = "Assigning...";

                    // Fetch all students
                    const resp = await fetch(`${API_BASE_URL}/allStudents`);
                    let allStudents = [];
                    if (resp.ok) {
                      allStudents = await resp.json();
                    } else {
                      throw new Error(
                        `Failed to fetch students: ${resp.status}`
                      );
                    }

                    if (allStudents.length === 0) {
                      alert("No students found in the system.");
                      return;
                    }

                    console.log(
                      `Found ${allStudents.length} students for admin assignment`
                    );

                    // Assign unit to each student
                    let successCount = 0;
                    let errorCount = 0;

                    for (const studentId of allStudents) {
                      try {
                        const assignResponse = await fetch(
                          `${API_BASE_URL}/assignUnitToStudent`,
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              studentId,
                              unitId: selectedUnitValue,
                              unitName: selectedUnitName,
                              assignedBy: "admin@trinity-capital.net",
                            }),
                          }
                        );

                        if (assignResponse.ok) {
                          successCount++;
                        } else {
                          errorCount++;
                          console.error(
                            `Failed to assign unit to student ${studentId}`
                          );
                        }
                      } catch (error) {
                        errorCount++;
                        console.error(
                          `Error assigning unit to student ${studentId}:`,
                          error
                        );
                      }
                    }

                    // Show results
                    if (successCount > 0) {
                      alert(
                        `Successfully assigned '${selectedUnitName}' to ${successCount} students.${
                          errorCount > 0 ? ` (${errorCount} failed)` : ""
                        }`
                      );
                    } else {
                      alert(
                        `Failed to assign unit to any students. Please check server logs.`
                      );
                    }

                    window.closeGlobalDialog();
                    loadTeacherLessons(window.activeTeacherName);
                  } catch (err) {
                    console.error("Error assigning unit to all students:", err);
                    alert(`Error: ${err.message}`);
                  } finally {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = "Confirm Assignment";
                  }
                },
                { once: true }
              );
            }
          } else {
            // Non-admin: assign to selected period/class
            // Hardcoding periods based on the UI tabs.
            const availablePeriods = ["01", "02", "03"];
            const periodOptions = availablePeriods
              .map(
                (p) => `<option value="${p}">Period ${parseInt(p, 10)}</option>`
              )
              .join("");
            const content = `
              <p>Assigning unit: <strong>${selectedUnitName}</strong></p>
              <div class="form-group" style="text-align: left; margin-top: 1em;">
                  <label for="classPeriodSelector">Select Class Period to Assign To:</label>
                  <select id="classPeriodSelector" class="dialog-input" style="width: 100%; margin-top: 0.5em;">
                      ${periodOptions}
                  </select>
              </div>
              <button id="confirmAssignBtn" class="btn btn-primary" style="margin-top: 1.5em;">Confirm Assignment</button>
            `;
            window.openGlobalDialog("Assign Unit to Class", content);
            const confirmBtn = document.getElementById("confirmAssignBtn");
            if (confirmBtn) {
              confirmBtn.addEventListener(
                "click",
                async () => {
                  const classPeriodSelector = document.getElementById(
                    "classPeriodSelector"
                  );
                  const selectedPeriod = classPeriodSelector.value;
                  try {
                    confirmBtn.disabled = true;
                    confirmBtn.textContent = "Assigning...";

                    // Get students in selected period
                    const resp = await fetch(
                      `${API_BASE_URL}/studentsInPeriod/${selectedPeriod}`
                    );
                    let studentsInPeriod = [];
                    if (resp.ok) {
                      studentsInPeriod = await resp.json();
                    } else {
                      throw new Error(
                        `Failed to fetch students in period: ${resp.status}`
                      );
                    }

                    if (studentsInPeriod.length === 0) {
                      alert(
                        `No students found in Period ${parseInt(
                          selectedPeriod,
                          10
                        )}.`
                      );
                      return;
                    }

                    console.log(
                      `Found ${studentsInPeriod.length} students in period ${selectedPeriod}`
                    );

                    // Assign unit to each student in period
                    let successCount = 0;
                    let errorCount = 0;

                    for (const studentId of studentsInPeriod) {
                      try {
                        const assignResponse = await fetch(
                          `${API_BASE_URL}/assignUnitToStudent`,
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              studentId,
                              unitId: selectedUnitValue,
                              unitName: selectedUnitName,
                              assignedBy: window.activeTeacherName,
                            }),
                          }
                        );

                        if (assignResponse.ok) {
                          successCount++;
                        } else {
                          errorCount++;
                          console.error(
                            `Failed to assign unit to student ${studentId}`
                          );
                        }
                      } catch (error) {
                        errorCount++;
                        console.error(
                          `Error assigning unit to student ${studentId}:`,
                          error
                        );
                      }
                    }

                    // Show results
                    if (successCount > 0) {
                      alert(
                        `Successfully assigned '${selectedUnitName}' to ${successCount} students in Period ${parseInt(
                          selectedPeriod,
                          10
                        )}.${errorCount > 0 ? ` (${errorCount} failed)` : ""}`
                      );
                    } else {
                      alert(
                        `Failed to assign unit to any students in Period ${parseInt(
                          selectedPeriod,
                          10
                        )}. Please check server logs.`
                      );
                    }

                    window.closeGlobalDialog();
                    loadTeacherLessons(window.activeTeacherName);
                  } catch (error) {
                    console.error("Error assigning unit:", error);
                    alert(`Error: ${error.message}`);
                  } finally {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = "Confirm Assignment";
                  }
                },
                { once: true }
              );
            }
          }
        });

      // Debug lesson data button
      document
        .getElementById("debugLessonBtn")
        .addEventListener("click", async () => {
          console.log("=== MANUAL LESSON DEBUG ===");

          // Check form elements
          const titleElement = document.getElementById("lessonTitle");
          const descElement = document.getElementById("lessonDescription");
          const unitElement = document.getElementById("unitSelector");

          console.log("Form elements found:");
          console.log("- Title element:", titleElement);
          console.log("- Description element:", descElement);
          console.log("- Unit selector element:", unitElement);

          if (titleElement) console.log("- Title value:", titleElement.value);
          if (descElement)
            console.log("- Description value:", descElement.value);
          if (unitElement) console.log("- Unit value:", unitElement.value);

          // Check content blocks
          const introBlocks = document.querySelectorAll(
            "#introBlocksContainer .content-block"
          );
          const conditionBlocks = document.querySelectorAll(
            "#conditionsContainer .condition-block"
          );

          console.log("Content blocks found:");
          console.log("- Intro blocks:", introBlocks.length);
          console.log("- Condition blocks:", conditionBlocks.length);

          // Check active teacher
          console.log("Active teacher:", window.activeTeacherName);

          // Check if editing
          console.log("Editing lesson ID:", window.editingLessonId);

          if (window.editingLessonId) {
            try {
              const response = await fetch(
                `${LESSON_SERVER_URL}/debug-lesson/${window.editingLessonId}`
              );
              const data = await response.json();

              console.log("=== LESSON DEBUG DATA ===");
              console.log("Lessons Collection:", data.lessonInLessons);
              console.log("Teachers Collection:", data.lessonInTeachers);
              console.log("Timestamp:", data.timestamp);

              alert(
                `Debug data logged to console. Check F12 -> Console for detailed lesson data comparison.`
              );
            } catch (error) {
              console.error("Error debugging lesson:", error);
              alert("Error fetching debug data. Check console for details.");
            }
          } else {
            alert(
              "Debug data logged to console. Check F12 -> Console for form state details."
            );
          }
        });

      document
        .getElementById("uploadToWhirlpoolBtn")
        .addEventListener("click", async () => {
          const unitSelector = document.getElementById("unitSelector");
          const selectedUnitValue = unitSelector.value;

          if (!selectedUnitValue) {
            alert("Please select a unit before uploading the lesson.");
            return;
          }

          const selectedUnitName =
            unitSelector.options[unitSelector.selectedIndex].text;

          const lessonData = {
            lesson_title: document.getElementById("lessonTitle").value,
            lesson_description:
              document.getElementById("lessonDescription")?.value || "",
            lesson_blocks: [], // This will be the intro_text_blocks
            lesson_conditions: [], // This will be the conditions
          };

          // Collect intro blocks
          document
            .querySelectorAll("#introBlocksContainer .content-block")
            .forEach((block) => {
              const type = block.dataset.blockType;
              const input = block.querySelector("input, textarea");
              const blockData = { type };
              if (type === "video") {
                blockData.url = input.value;
              } else {
                blockData.content = input.value;
              }
              lessonData.lesson_blocks.push(blockData);
            });

          // Collect conditions
          document
            .querySelectorAll("#conditionsContainer .condition-block")
            .forEach((block) => {
              const condition = {
                condition_type: block.querySelector(".condition-type").value,
                value: parseFloat(
                  block.querySelector(".condition-value").value
                ),
                action: {
                  type: block.querySelector(".action-type").value,
                },
              };
              const actionContentEl = block.querySelector(".action-content");
              if (actionContentEl) {
                if (condition.action.type === "add_text_block") {
                  condition.action.block = {
                    type: "text",
                    content: actionContentEl.value,
                  };
                } else {
                  condition.action.content = actionContentEl.value;
                }
              }
              lessonData.lesson_conditions.push(condition);
            });

          // Construct the final payload
          const parcel = {
            lesson: lessonData,
            unit: {
              value: selectedUnitValue,
              name: selectedUnitName,
            },
            teacher: window.activeTeacherName,
          };

          try {
            const response = await fetch(
              `${LESSON_SERVER_URL}/upload-whirlpool`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(parcel),
              }
            );

            if (response.ok) {
              const result = await response.json();
              console.log("Lesson sent to Whirlpool:", result);
              alert(
                "Lesson sent to Whirlpool! The server has logged the data."
              );
            } else {
              console.error(
                "Failed to upload to Whirlpool:",
                response.statusText
              );
              alert(
                `Error: Failed to upload to Whirlpool. Status: ${response.status}`
              );
            }
          } catch (error) {
            console.error("Error sending lesson data to Whirlpool:", error);
            alert(
              "An error occurred while uploading to Whirlpool. Check the console."
            );
          }
        });

      // Function to populate edit lesson selector
      function populateEditLessonSelector() {
        const editLessonSelector =
          document.getElementById("editLessonSelector");
        editLessonSelector.innerHTML =
          '<option value="">-- Select a lesson to edit --</option>';

        if (window.allTeacherLessons && window.allTeacherLessons.length > 0) {
          window.allTeacherLessons.forEach((lesson) => {
            const option = document.createElement("option");
            option.value = lesson._id;
            option.textContent = `${lesson.lesson_title} (${
              lesson.teacher || "Unknown"
            })`;
            editLessonSelector.appendChild(option);
          });
        }
      }

      // Function to populate lesson data into the form for editing
      function populateLessonForEditing(lesson) {
        console.log("=== POPULATING LESSON FOR EDITING ===");
        console.log("Lesson object received:", lesson);
        console.log("Lesson blocks:", lesson.lesson_blocks);
        console.log("Lesson conditions:", lesson.lesson_conditions);

        // Set lesson title
        document.getElementById("lessonTitle").value =
          lesson.lesson_title || "";

        // Set lesson description
        document.getElementById("lessonDescription").value =
          lesson.lesson_description || "";

        // Clear existing blocks
        const introBlocksContainer = document.getElementById(
          "introBlocksContainer"
        );
        const conditionsContainer = document.getElementById(
          "conditionsContainer"
        );
        introBlocksContainer.innerHTML = "";
        conditionsContainer.innerHTML = "";

        // Populate intro blocks
        if (lesson.lesson_blocks && lesson.lesson_blocks.length > 0) {
          console.log(
            "Found lesson blocks, populating:",
            lesson.lesson_blocks.length
          );
          lesson.lesson_blocks.forEach((blockData, index) => {
            console.log(`Block ${index}:`, blockData);
            const block = document.createElement("div");
            block.className = "content-block";
            block.dataset.blockType = blockData.type;

            let innerHTML = `<button type="button" class="remove-btn">&times;</button>`;

            switch (blockData.type) {
              case "header":
                innerHTML += `<label>Header</label><input type="text" class="dialog-input" placeholder="Enter header text..." value="${
                  blockData.content || ""
                }">`;
                break;
              case "text":
                innerHTML += `<label>Text Block</label><textarea class="dialog-textarea" placeholder="Enter paragraph text...">${
                  blockData.content || ""
                }</textarea>`;
                break;
              case "video":
                innerHTML += `<label>Video URL or YouTube Embed</label><input type="text" class="dialog-input video-url-input" placeholder="e.g., https://www.youtube.com/watch?v=... or .mp4 URL" value="${
                  blockData.url || ""
                }">
                <div class="video-preview-container" style="margin-top: 0.5em; display: none;"></div>`;
                break;
            }

            block.innerHTML = innerHTML;
            introBlocksContainer.appendChild(block);

            // If it's a video block, trigger preview update
            if (blockData.type === "video" && blockData.url) {
              const input = block.querySelector(".video-url-input");
              const previewContainer = block.querySelector(
                ".video-preview-container"
              );
              const embedUrl = getYoutubeEmbedUrl(blockData.url);

              if (embedUrl) {
                previewContainer.style.display = "block";
                if (embedUrl.includes("youtube.com/embed")) {
                  previewContainer.innerHTML = `<iframe width="100%" height="150" src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius: 8px;"></iframe>`;
                } else {
                  previewContainer.innerHTML = `<video width="100%" height="150" controls src="${embedUrl}" style="border-radius: 8px;"></video>`;
                }
              }
            }
          });
        } else {
          console.log(
            "No lesson_blocks found, checking alternative field names..."
          );
          console.log("intro_text_blocks:", lesson.intro_text_blocks);

          // Fallback: check if data is stored under old field names
          if (lesson.intro_text_blocks && lesson.intro_text_blocks.length > 0) {
            console.log("Found intro_text_blocks, using those instead");
            lesson.intro_text_blocks.forEach((blockData, index) => {
              console.log(`Legacy block ${index}:`, blockData);
              const block = document.createElement("div");
              block.className = "content-block";
              block.dataset.blockType = blockData.type;

              let innerHTML = `<button type="button" class="remove-btn">&times;</button>`;

              switch (blockData.type) {
                case "header":
                  innerHTML += `<label>Header</label><input type="text" class="dialog-input" placeholder="Enter header text..." value="${
                    blockData.content || ""
                  }">`;
                  break;
                case "text":
                  innerHTML += `<label>Text Block</label><textarea class="dialog-textarea" placeholder="Enter paragraph text...">${
                    blockData.content || ""
                  }</textarea>`;
                  break;
                case "video":
                  innerHTML += `<label>Video URL or YouTube Embed</label><input type="text" class="dialog-input video-url-input" placeholder="e.g., https://www.youtube.com/watch?v=... or .mp4 URL" value="${
                    blockData.url || ""
                  }">
                  <div class="video-preview-container" style="margin-top: 0.5em; display: none;"></div>`;
                  break;
              }

              block.innerHTML = innerHTML;
              introBlocksContainer.appendChild(block);

              // If it's a video block, trigger preview update
              if (blockData.type === "video" && blockData.url) {
                const input = block.querySelector(".video-url-input");
                const previewContainer = block.querySelector(
                  ".video-preview-container"
                );
                const embedUrl = getYoutubeEmbedUrl(blockData.url);

                if (embedUrl) {
                  previewContainer.style.display = "block";
                  if (embedUrl.includes("youtube.com/embed")) {
                    previewContainer.innerHTML = `<iframe width="100%" height="150" src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius: 8px;"></iframe>`;
                  } else {
                    previewContainer.innerHTML = `<video width="100%" height="150" controls src="${embedUrl}" style="border-radius: 8px;"></video>`;
                  }
                }
              }
            });
          }
        }

        // Populate conditions
        if (lesson.lesson_conditions && lesson.lesson_conditions.length > 0) {
          console.log(
            "Found lesson_conditions, populating:",
            lesson.lesson_conditions.length
          );
          lesson.lesson_conditions.forEach((conditionData) => {
            const condition = document.createElement("div");
            condition.className = "condition-block";
            condition.innerHTML = `
              <button type="button" class="remove-btn">&times;</button>
              <div class="form-group">
                <label>If</label>
                <select class="dialog-input condition-type">
                  <option value="bank_balance_above" ${
                    conditionData.condition_type === "bank_balance_above"
                      ? "selected"
                      : ""
                  }>Bank Balance Is Above</option>
                  <option value="elapsed_time" ${
                    conditionData.condition_type === "elapsed_time"
                      ? "selected"
                      : ""
                  }>Time in Lesson (Seconds)</option>
                  <option value="quiz_score_below" ${
                    conditionData.condition_type === "quiz_score_below"
                      ? "selected"
                      : ""
                  }>Quiz Score Is Below</option>
                </select>
                <input type="number" class="dialog-input condition-value" placeholder="Value" style="max-width: 100px;" value="${
                  conditionData.value || ""
                }">
              </div>
              <div class="form-group">
                <label>Then</label>
                <select class="dialog-input action-type">
                  <option value="send_message" ${
                    conditionData.action?.type === "send_message"
                      ? "selected"
                      : ""
                  }>Send Message</option>
                  <option value="add_text_block" ${
                    conditionData.action?.type === "add_text_block"
                      ? "selected"
                      : ""
                  }>Add Text Block</option>
                  <option value="restart_student" ${
                    conditionData.action?.type === "restart_student"
                      ? "selected"
                      : ""
                  }>Restart Student</option>
                </select>
              </div>
              <div class="action-details"></div>
            `;
            conditionsContainer.appendChild(condition);

            // Populate action details
            const actionSelect = condition.querySelector(".action-type");
            const detailsContainer = condition.querySelector(".action-details");
            const actionType = conditionData.action?.type;

            if (
              actionType === "send_message" ||
              actionType === "add_text_block"
            ) {
              let content = "";
              if (actionType === "send_message") {
                content = conditionData.action?.content || "";
              } else if (actionType === "add_text_block") {
                content = conditionData.action?.block?.content || "";
              }
              detailsContainer.innerHTML = `<textarea class="dialog-textarea action-content" placeholder="Enter content for action...">${content}</textarea>`;
            }
          });
        } else {
          console.log(
            "No lesson_conditions found, checking alternative field names..."
          );
          console.log("conditions:", lesson.conditions);

          // Fallback: check if data is stored under old field names
          if (lesson.conditions && lesson.conditions.length > 0) {
            console.log("Found legacy conditions, using those instead");
            lesson.conditions.forEach((conditionData) => {
              const condition = document.createElement("div");
              condition.className = "condition-block";
              condition.innerHTML = `
                <button type="button" class="remove-btn">&times;</button>
                <div class="form-group">
                  <label>If</label>
                  <select class="dialog-input condition-type">
                    <option value="bank_balance_above" ${
                      conditionData.condition_type === "bank_balance_above"
                        ? "selected"
                        : ""
                    }>Bank Balance Is Above</option>
                    <option value="elapsed_time" ${
                      conditionData.condition_type === "elapsed_time"
                        ? "selected"
                        : ""
                    }>Time in Lesson (Seconds)</option>
                    <option value="quiz_score_below" ${
                      conditionData.condition_type === "quiz_score_below"
                        ? "selected"
                        : ""
                    }>Quiz Score Is Below</option>
                  </select>
                  <input type="number" class="dialog-input condition-value" placeholder="Value" style="max-width: 100px;" value="${
                    conditionData.value || ""
                  }">
                </div>
                <div class="form-group">
                  <label>Then</label>
                  <select class="dialog-input action-type">
                    <option value="send_message" ${
                      conditionData.action?.type === "send_message"
                        ? "selected"
                        : ""
                    }>Send Message</option>
                    <option value="add_text_block" ${
                      conditionData.action?.type === "add_text_block"
                        ? "selected"
                        : ""
                    }>Add Text Block</option>
                    <option value="restart_student" ${
                      conditionData.action?.type === "restart_student"
                        ? "selected"
                        : ""
                    }>Restart Student</option>
                  </select>
                </div>
                <div class="action-details"></div>
              `;
              conditionsContainer.appendChild(condition);

              // Populate action details
              const actionSelect = condition.querySelector(".action-type");
              const detailsContainer =
                condition.querySelector(".action-details");
              const actionType = conditionData.action?.type;

              if (
                actionType === "send_message" ||
                actionType === "add_text_block"
              ) {
                let content = "";
                if (actionType === "send_message") {
                  content = conditionData.action?.content || "";
                } else if (actionType === "add_text_block") {
                  content = conditionData.action?.block?.content || "";
                }
                detailsContainer.innerHTML = `<textarea class="dialog-textarea action-content" placeholder="Enter content for action...">${content}</textarea>`;
              }
            });
          }
        }
      }

      // Edit lesson selector change handler
      document
        .getElementById("editLessonSelector")
        .addEventListener("change", function () {
          const editLessonBtn = document.getElementById("editLessonBtn");
          editLessonBtn.disabled = !this.value;
        });

      // Edit lesson button handler
      document
        .getElementById("editLessonBtn")
        .addEventListener("click", function () {
          const selectedLessonId =
            document.getElementById("editLessonSelector").value;

          if (!selectedLessonId) {
            alert("Please select a lesson to edit.");
            return;
          }

          // Find the selected lesson
          const lessonToEdit = window.allTeacherLessons.find(
            (lesson) => lesson._id === selectedLessonId
          );

          console.log("=== LESSON EDITING DEBUG ===");
          console.log("Selected lesson ID:", selectedLessonId);
          console.log("All teacher lessons:", window.allTeacherLessons);
          console.log("Found lesson to edit:", lessonToEdit);

          if (!lessonToEdit) {
            alert("Selected lesson not found.");
            return;
          }

          // Populate the form with lesson data
          populateLessonForEditing(lessonToEdit);

          // Store the lesson ID for saving
          window.editingLessonId = selectedLessonId;

          // Update the save button text to indicate editing mode
          const saveLessonBtn = document.getElementById("saveLessonBtn");
          saveLessonBtn.textContent = "Update Lesson";

          // Show confirmation
          alert(
            `Lesson "${lessonToEdit.lesson_title}" loaded for editing. Make your changes and click "Update Lesson" to save.`
          );
        });
    });

  // Global event handler function for lesson management modal - defined outside to prevent duplicates
  function handleLessonManagementDialogClick(e) {
    if (e.target.classList.contains("remove-lesson-btn")) {
      const lessonItem = e.target.closest("li");
      const unitCard = lessonItem.closest(".assigned-unit-card");
      const unitValue = unitCard.getAttribute("data-unit-value");

      if (lessonItem && unitValue) {
        // Initialize pending changes for this unit if not exists
        if (!window.pendingLessonChanges.has(unitValue)) {
          const unit = window.teacherUnits.find((u) => u.value === unitValue);
          if (unit && unit.lessons) {
            window.pendingLessonChanges.set(unitValue, {
              originalLessons: JSON.parse(JSON.stringify(unit.lessons)), // Deep copy
              pendingLessons: JSON.parse(JSON.stringify(unit.lessons)), // Deep copy
            });
          }
        }

        // Get the lesson position in the DOM
        const lessonItems = unitCard.querySelectorAll("li[data-lesson-id]");
        const lessonIndex = Array.from(lessonItems).indexOf(lessonItem);

        // Update pending changes tracking
        const pendingData = window.pendingLessonChanges.get(unitValue);
        if (pendingData && lessonIndex >= 0) {
          pendingData.pendingLessons.splice(lessonIndex, 1);
          console.log(
            `Removed lesson at index ${lessonIndex} from pending changes`
          );
        }

        // Remove from DOM
        lessonItem.remove();
        console.log("Lesson item removed from view.");

        // Show visual indicator that there are unsaved changes
        const saveButton = unitCard.querySelector(".save-unit-btn");
        if (saveButton && !saveButton.disabled) {
          saveButton.style.backgroundColor = "#ff6b35";
          saveButton.textContent = "Save Changes (Unsaved)";
          saveButton.style.animation = "pulse 1s infinite";
        }
      }
    } else if (e.target.classList.contains("replace-lesson-btn")) {
      handleLessonReplace(e.target);
    } else if (e.target.classList.contains("save-unit-btn")) {
      handleSaveUnit(e.target);
    } else if (e.target.classList.contains("copy-unit-btn")) {
      handleCopyDefaultUnit(e.target);
    }
  }

  document
    .getElementById("lessonManagementBtn")
    ?.addEventListener("click", function () {
      const content = `
        <style>
          /* Master teacher content styling */
          .lesson-list-management li[data-is-master="true"] {
            background: linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, rgba(255, 215, 0, 0.05) 100%);
            border-left: 3px solid #ffd700;
            padding-left: 12px;
          }
          
          .lesson-list-management li[data-is-master="false"] {
            background: linear-gradient(135deg, rgba(144, 238, 144, 0.1) 0%, rgba(144, 238, 144, 0.05) 100%);
            border-left: 3px solid #90EE90;
            padding-left: 12px;
          }
          
          .master-content-header {
            animation: fadeInSlide 0.5s ease-out;
          }
          
          @keyframes fadeInSlide {
            from {
              opacity: 0;
              transform: translateY(-10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
          }
          
          /* Enhanced optgroup styling */
          select optgroup {
            font-weight: bold;
            font-style: normal;
            color: #333;
          }
          
          select optgroup[label*="Master"] {
            background-color: #fff9e6;
          }
          
          select optgroup[label*="Your"] {
            background-color: #f0fff0;
          }
        </style>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1em;">
          <h4 style="margin: 0;">Lesson Management</h4>
          <button id="refreshLessonDataBtn" class="btn btn-secondary" style="background: #6c757d; color: white; border: none; padding: 0.5em 1em; border-radius: 4px; cursor: pointer;">
            🔄 Refresh Data
          </button>
        </div>
        
        <div class="lesson-management-container">
          
          <!-- Left Panel: Displays assigned units and their lessons -->
          <div class="assigned-units-view">
            <h5>Currently Assigned Units</h5>
            <div id="assignedUnitsContainer">
              <!-- Units will be populated dynamically -->
            </div>
          </div>

          <!-- Right Panel: Tools for managing lessons -->
          <div class="lesson-tools">
            <h5>Lesson Tools</h5>
            
            <div class="form-group">
              <label for="masterLessonSelect">All Available Lessons</label>
              <select id="masterLessonSelect" class="dialog-input" style="margin-top: 0.5em;"></select>
              <small style="font-size: 0.8em; color: rgba(255,255,255,0.7); margin-top: 0.5em;">
                📚 = Default lessons from master teacher<br>
                📝 = Your own lessons<br>
                To replace a lesson, select one from this list, then click "Replace" on a lesson to the left.
              </small>
            </div>
            
            <hr />
            
            <h5>Assign Unit to Class</h5>
            <form id="assignUnitForm">
              <div class="form-group" style="margin-top: 1em;"><label for="unitSelectForAssignment">Select Unit:</label><select id="unitSelectForAssignment" class="dialog-input" style="width: 100%; margin-top: 0.5em;"></select></div>
              <div class="form-group" style="margin-top: 1em;"><label for="classPeriodSelect">Select Class Period:</label><select id="classPeriodSelect" class="dialog-input" style="width: 100%; margin-top: 0.5em;"><option value="01">Period 1</option><option value="02">Period 2</option><option value="03">Period 3</option></select></div>
              <button type="submit" class="btn btn-primary" style="margin-top: 1.5em; width: 100%;">Assign Unit</button>
            </form>
          </div>
        </div>
      `;
      window.openGlobalDialog("Lesson Management", "");
      document.getElementById("dialogContent").innerHTML = content;

      // Initialize pending changes tracking
      if (!window.pendingLessonChanges) {
        window.pendingLessonChanges = new Map();
      } else {
        // Clear any existing pending changes when opening the modal fresh
        window.pendingLessonChanges.clear();
      }

      // Join the lesson management room for real-time updates
      if (window.activeTeacherName) {
        console.log(
          "Joining lesson management room for:",
          window.activeTeacherName
        );
        lessonSocket.emit("joinLessonManagement", window.activeTeacherName);
      }

      // Always refresh teacher data when opening lesson management modal
      // This ensures we have the most up-to-date mix of default and custom units
      console.log(
        "Loading/refreshing teacher data for lesson management modal"
      );
      loadTeacherLessons(window.activeTeacherName)
        .then(() => {
          console.log(
            "Teacher data loaded/refreshed for lesson management modal"
          );
          console.log("Current teacherUnits:", window.teacherUnits);
          console.log("Current contentType:", window.contentType);

          // After data is loaded, populate the modal
          populateAssignedUnits();
          populateMasterLessonSelect();
          populateUnitSelectorForAssignment();
        })
        .catch((error) => {
          console.error(
            "Error loading teacher data for lesson management:",
            error
          );
          // Fallback to existing data if available
          if (window.teacherUnits && window.allTeacherLessons) {
            populateAssignedUnits();
            populateMasterLessonSelect();
            populateUnitSelectorForAssignment();
          }
        });

      // Add refresh button event handler
      document
        .getElementById("refreshLessonDataBtn")
        ?.addEventListener("click", function () {
          console.log("Manual refresh requested by user");

          // Show loading indication
          this.textContent = "🔄 Refreshing...";
          this.disabled = true;

          // Use loadTeacherLessons to ensure proper default unit handling
          loadTeacherLessons(window.activeTeacherName)
            .then(() => {
              console.log(
                "Manual refresh completed - reloading lesson management modal"
              );
              showNotification("Lesson data refreshed successfully", "success");

              // Refresh the modal display with updated data
              refreshLessonManagementModal();
            })
            .catch((error) => {
              console.error("Error refreshing lesson data:", error);
              showNotification("Error refreshing lesson data", "error");
            })
            .finally(() => {
              // Reset button
              this.textContent = "🔄 Refresh Data";
              this.disabled = false;
            });
        });

      // Function to populate assigned units from teacherUnits data
      function populateAssignedUnits() {
        const container = document.getElementById("assignedUnitsContainer");
        // Use the global function that handles default units properly
        populateAssignedUnitsDisplay(container);
      }

      // Function to populate unit selector for assignment
      function populateUnitSelectorForAssignment() {
        const unitSelector = document.getElementById("unitSelectForAssignment");
        // Use the global function that handles default units properly
        populateUnitSelectorForAssignmentDisplay(unitSelector);
      }

      // Define the event handler function once to avoid duplicates
      // Note: Now using the global function defined outside this click handler

      // Remove any existing event listeners before adding new ones to prevent duplicates
      const dialogContent = document.getElementById("dialogContent");
      dialogContent.removeEventListener(
        "click",
        handleLessonManagementDialogClick
      );
      dialogContent.addEventListener(
        "click",
        handleLessonManagementDialogClick
      );

      // Handle lesson assignment to units
      document
        .getElementById("assignLessonToUnitBtn")
        ?.addEventListener("click", function () {
          const selectedLessonId = document.getElementById(
            "allAvailableLessonsSelect"
          ).value;
          const selectedUnitValue = document.getElementById(
            "unitSelectForAssignment"
          ).value;

          if (!selectedLessonId || !selectedUnitValue) {
            alert(
              "Please select both a lesson and a unit to assign the lesson to."
            );
            return;
          }

          // Find the selected lesson details
          const selectedLesson = window.allTeacherLessons.find(
            (lesson) => lesson._id === selectedLessonId
          );
          if (!selectedLesson) {
            alert("Selected lesson not found.");
            return;
          }

          // Find the selected unit
          const selectedUnit = window.teacherUnits.find(
            (unit) => unit.value === selectedUnitValue
          );
          if (!selectedUnit) {
            alert("Selected unit not found.");
            return;
          }

          // Add the lesson to the unit
          if (!selectedUnit.lessons) {
            selectedUnit.lessons = [];
          }

          // Check if lesson is already in the unit
          const isAlreadyAssigned = selectedUnit.lessons.some(
            (lesson) => lesson._id === selectedLessonId
          );
          if (isAlreadyAssigned) {
            alert("This lesson is already assigned to this unit.");
            return;
          }

          // Add the lesson to the unit
          selectedUnit.lessons.push(selectedLesson);

          // Update the UI
          populateAssignedUnits();

          // Clear the selection
          document.getElementById("allAvailableLessonsSelect").value = "";
          document.getElementById("unitSelectForAssignment").value = "";

          alert("Lesson assigned to unit successfully!");
        });

      // Handle unit assignment to class periods
      document
        .getElementById("assignUnitForm")
        ?.addEventListener("submit", async function (e) {
          e.preventDefault(); // Prevent form from submitting normally

          const unitSelect = document.getElementById("unitSelectForAssignment");
          const periodSelect = document.getElementById("classPeriodSelect");

          const selectedUnitValue = unitSelect.value;
          const selectedPeriod = periodSelect.value;

          if (!selectedUnitValue || !selectedPeriod) {
            alert("Please select both a unit and a class period.");
            return;
          }

          // Find the selected unit details
          const selectedUnit = window.teacherUnits.find(
            (unit) => unit.value === selectedUnitValue
          );
          if (!selectedUnit) {
            alert("Selected unit not found.");
            return;
          }

          try {
            const response = await fetch(`http://localhost:4000/assign-unit`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                teacherName: window.activeTeacherName,
                unitValue: selectedUnitValue,
                classPeriod: selectedPeriod,
              }),
            });

            const result = await response.json();

            if (response.ok && result.success) {
              showNotification(
                `Successfully assigned '${
                  selectedUnit.name
                }' to Period ${parseInt(selectedPeriod, 10)}.`
              );

              // Clear the form selections
              unitSelect.value = "";
              periodSelect.value = "";

              // Refresh the lesson data to show updated assignment status
              loadTeacherLessons(window.activeTeacherName);
            } else {
              showNotification(
                `Error: ${result.message || "Failed to assign unit."}`,
                "error"
              );
            }
          } catch (error) {
            console.error("Error assigning unit:", error);
            alert(
              "An error occurred while assigning the unit. Please try again."
            );
          }
        });
    });

  // Initialize pending changes tracking
  if (!window.pendingLessonChanges) {
    window.pendingLessonChanges = new Map(); // unitValue -> { originalLessons: [], pendingLessons: [] }
  }

  // Function to handle lesson replacement - moved outside lesson management handler to prevent scope issues
  function handleLessonReplace(replaceButton) {
    const masterLessonSelect = document.getElementById("masterLessonSelect");
    const selectedLessonId = masterLessonSelect.value;

    if (!selectedLessonId) {
      alert(
        "Please select a lesson from the 'All Available Lessons' dropdown first."
      );
      return;
    }

    const selectedLessonText =
      masterLessonSelect.options[masterLessonSelect.selectedIndex].text;
    const lessonItem = replaceButton.closest("li");
    const lessonSpan = lessonItem.querySelector("span");
    const currentLessonText = lessonSpan.textContent;

    // Get the lesson ID and unit value from data attributes
    const currentLessonId = lessonItem.getAttribute("data-lesson-id");
    const unitCard = lessonItem.closest(".assigned-unit-card");
    const unitValue = unitCard.getAttribute("data-unit-value");

    // Debug logging
    console.log("Debug - Replace lesson data:");
    console.log("Lesson item clicked:", lessonItem);
    console.log(
      "currentLessonId:",
      currentLessonId,
      "type:",
      typeof currentLessonId
    );
    console.log("unitValue:", unitValue, "type:", typeof unitValue);
    console.log(
      "selectedLessonId:",
      selectedLessonId,
      "type:",
      typeof selectedLessonId
    );

    if (!currentLessonId || !unitValue) {
      console.error(
        "Missing IDs - currentLessonId:",
        currentLessonId,
        "unitValue:",
        unitValue
      );
      alert(
        "Unable to find the lesson to replace. The data structure is missing required IDs. Please check the lesson server data format."
      );
      return;
    }

    // Confirm the replacement
    const confirmReplace = confirm(
      `Are you sure you want to replace "${currentLessonText}" with "${selectedLessonText}"?`
    );

    if (!confirmReplace) {
      return;
    }

    // Initialize pending changes for this unit if not exists
    if (!window.pendingLessonChanges.has(unitValue)) {
      const unit = window.teacherUnits.find((u) => u.value === unitValue);
      if (unit && unit.lessons) {
        window.pendingLessonChanges.set(unitValue, {
          originalLessons: JSON.parse(JSON.stringify(unit.lessons)), // Deep copy
          pendingLessons: JSON.parse(JSON.stringify(unit.lessons)), // Deep copy
        });
      }
    }

    // Get the new lesson data from allTeacherLessons
    const newLessonData = window.allTeacherLessons.find(
      (l) => l._id === selectedLessonId
    );

    if (!newLessonData) {
      alert("Unable to find the selected lesson data. Please try again.");
      return;
    }

    // Update the UI to show the new lesson
    lessonSpan.textContent = `Lesson: ${selectedLessonText}`;
    lessonItem.setAttribute("data-lesson-id", selectedLessonId);

    // Mark this lesson item as changed
    lessonItem.setAttribute("data-changed", "true");
    lessonItem.style.backgroundColor = "rgba(255, 193, 7, 0.2)"; // Yellow highlight
    lessonItem.style.border = "1px solid rgba(255, 193, 7, 0.5)";

    // Update pending changes tracking
    const pendingData = window.pendingLessonChanges.get(unitValue);
    if (pendingData) {
      // Find the lesson position in the lessons array by matching the current position in the DOM
      const lessonItems = unitCard.querySelectorAll("li[data-lesson-id]");
      const lessonIndex = Array.from(lessonItems).indexOf(lessonItem);

      if (lessonIndex >= 0 && lessonIndex < pendingData.pendingLessons.length) {
        // Replace the lesson at this specific index
        pendingData.pendingLessons[lessonIndex] = {
          _id: selectedLessonId,
          lesson_title: newLessonData.lesson_title,
          intro_text_blocks: newLessonData.intro_text_blocks,
          conditions: newLessonData.conditions,
        };

        console.log(
          `Updated pending lesson at index ${lessonIndex}:`,
          pendingData.pendingLessons[lessonIndex]
        );
      }
    }

    // Show visual indicator that there are unsaved changes
    const saveButton = unitCard.querySelector(".save-unit-btn");
    if (saveButton && !saveButton.disabled) {
      saveButton.style.backgroundColor = "#ff6b35";
      saveButton.textContent = "Save Changes (Unsaved)";
      saveButton.style.animation = "pulse 1s infinite";
    }

    // Reset the dropdown
    masterLessonSelect.selectedIndex = 0;

    console.log(
      `Lesson replaced in UI - Unit: ${unitValue}, Position: ${Array.from(
        unitCard.querySelectorAll("li[data-lesson-id]")
      ).indexOf(lessonItem)}`
    );
  }
});

// Handle saving unit changes
async function handleSaveUnit(saveButton) {
  console.log("=== HANDLE SAVE UNIT START ===");
  console.log("Save button clicked:", saveButton);
  console.log("window.teacherUnits:", window.teacherUnits);
  console.log("window.allTeacherLessons:", window.allTeacherLessons);
  console.log("window.activeTeacherName:", window.activeTeacherName);

  const unitCard = saveButton.closest(".assigned-unit-card");
  if (!unitCard) {
    console.error("Could not find assigned-unit-card ancestor");
    alert("Unable to find unit information. Please try again.");
    return;
  }

  const unitValue = unitCard.getAttribute("data-unit-value");
  console.log("Unit card found:", unitCard);
  console.log("Unit value from data attribute:", unitValue);

  if (!unitValue) {
    console.error("Unit card HTML:", unitCard.outerHTML);
    alert("Unable to find unit identifier. Please try again.");
    return;
  }

  // Find the complete unit data from window.teacherUnits
  const currentUnit = window.teacherUnits.find((u) => u.value === unitValue);
  if (!currentUnit) {
    console.error(
      "Could not find unit in teacherUnits array. Available units:",
      window.teacherUnits
    );
    console.error("Looking for unit value:", unitValue);
    alert("Unable to find unit data. Please refresh and try again.");
    return;
  }

  console.log("Found current unit:", currentUnit);

  // Determine lessons to save - use pending changes if they exist, otherwise use current unit lessons
  let lessonsToSave = [];

  if (
    window.pendingLessonChanges &&
    window.pendingLessonChanges.has(unitValue)
  ) {
    // Use pending changes
    const pendingData = window.pendingLessonChanges.get(unitValue);
    lessonsToSave = pendingData.pendingLessons.map((lesson) => ({
      lesson_title: lesson.lesson_title,
      intro_text_blocks: lesson.intro_text_blocks,
      conditions: lesson.conditions,
    }));
    console.log("Using pending changes for lessons:", lessonsToSave);
  } else {
    // No pending changes - extract lessons from the DOM as fallback
    const lessonItems = unitCard.querySelectorAll(
      ".lesson-list-management li[data-lesson-id]"
    );

    lessonItems.forEach((lessonItem) => {
      const lessonId = lessonItem.getAttribute("data-lesson-id");
      const lessonText = lessonItem.querySelector("span")?.textContent;

      // Only process items that have a valid lesson ID and are not placeholder text
      if (
        lessonId &&
        lessonId.trim() !== "" &&
        lessonText &&
        lessonText !== "No lessons in this unit yet." &&
        !lessonText.includes("No lessons in this unit yet")
      ) {
        // Find the full lesson data from allTeacherLessons
        const fullLesson = window.allTeacherLessons.find(
          (l) => l._id === lessonId
        );
        if (fullLesson) {
          lessonsToSave.push({
            lesson_title: fullLesson.lesson_title,
            intro_text_blocks: fullLesson.intro_text_blocks,
            conditions: fullLesson.conditions,
          });
        } else {
          console.warn(
            "Could not find full lesson data for lesson ID:",
            lessonId
          );
        }
      }
    });
    console.log(
      "No pending changes - extracted lessons from DOM:",
      lessonsToSave
    );
  }

  // Create the complete unit data object with updated lessons
  const unitData = {
    value: currentUnit.value,
    name: currentUnit.name,
    lessons: lessonsToSave,
  };

  // Validate the unit data before sending
  if (!unitData.value || !unitData.name) {
    console.error("Unit data is missing required fields:", unitData);
    console.error("Current unit:", currentUnit);
    alert("Unit data is incomplete. Please refresh and try again.");
    return;
  }

  // Debug logging
  console.log("Saving unit:", unitValue);
  console.log("Complete unit data to save:", unitData);

  try {
    const originalText = saveButton.textContent;
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    const requestPayload = {
      teacherName: window.activeTeacherName, // Ensure this is the teacher's name, not username
      unitData: unitData,
    };

    console.log("=== SENDING REQUEST TO SERVER ===");
    console.log("Request URL:", "http://localhost:4000/saveUnitChanges");
    console.log("Request payload:", JSON.stringify(requestPayload, null, 2));
    const response = await fetch(`${LESSON_SERVER_URL}/saveUnitChanges`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      showNotification(
        `Unit "${unitData.name}" changes saved successfully!`,
        "success"
      );

      // Update the local data
      if (window.teacherUnits && Array.isArray(window.teacherUnits)) {
        const unit = window.teacherUnits.find((u) => u.value === unitValue);
        if (unit) {
          unit.lessons = lessonsToSave;
        }
      }

      // AUTO-ASSIGN UNIT WITH COMPLETE LESSON CONTENT TO STUDENTS
      console.log(
        "Auto-assigning unit with complete lesson content after save..."
      );
      try {
        await autoAssignUnitToStudents(unitData.value, unitData.name);
        console.log("Auto-assignment completed successfully after unit save");
      } catch (assignError) {
        console.error("Auto-assignment failed after unit save:", assignError);
        // Don't let assignment failure interfere with save success
      }

      // Clear pending changes for this unit since they've been saved
      if (
        window.pendingLessonChanges &&
        window.pendingLessonChanges.has(unitValue)
      ) {
        window.pendingLessonChanges.delete(unitValue);
        console.log("Cleared pending changes for unit:", unitValue);
      }

      // Remove visual indicators of unsaved changes
      const changedLessons = unitCard.querySelectorAll(
        "li[data-changed='true']"
      );
      changedLessons.forEach((lessonItem) => {
        lessonItem.removeAttribute("data-changed");
        lessonItem.style.backgroundColor = "";
        lessonItem.style.border = "";
      });

      // Visual feedback - briefly change button color
      saveButton.style.backgroundColor = "#28a745";
      saveButton.style.animation = "";
      saveButton.textContent = "Saved!";

      setTimeout(() => {
        saveButton.style.backgroundColor = "";
        saveButton.textContent = originalText;
      }, 2000);
    } else {
      // Handle specific error for default unit modification
      if (result.isDefaultUnitError) {
        showNotification(
          "You cannot modify default units. Please create your own unit and lessons instead.",
          "error",
          8000
        );
      } else {
        showNotification(
          `Error: ${result.message || "Failed to save unit changes"}`,
          "error"
        );
      }
    }
  } catch (error) {
    console.error("Error saving unit changes:", error);
    alert("An error occurred while saving unit changes. Please try again.");
  } finally {
    saveButton.disabled = false;
    if (saveButton.textContent === "Saving...") {
      saveButton.textContent = `Save Changes to ${unitValue}`;
    }
  }
}

// Handle copying default unit to teacher's own units
async function handleCopyDefaultUnit(copyButton) {
  console.log("=== HANDLE COPY DEFAULT UNIT START ===");

  const unitCard = copyButton.closest(".assigned-unit-card");
  if (!unitCard) {
    console.error("Could not find assigned-unit-card ancestor");
    alert("Unable to find unit information. Please try again.");
    return;
  }

  const unitValue = unitCard.getAttribute("data-unit-value");
  if (!unitValue) {
    console.error("Unit value not found in data-unit-value attribute");
    alert("Unable to identify unit. Please refresh and try again.");
    return;
  }

  // Confirm with the user
  const unitTitle = unitCard
    .querySelector("h6")
    .textContent.replace(" (Default unit)", "");
  const confirmMessage = `Copy "${unitTitle}" to your own units?\n\nThis will create your own editable copy of this default unit with all its lessons. You'll then be able to modify it as needed.`;

  if (!confirm(confirmMessage)) {
    return;
  }

  try {
    // Disable button during operation
    const originalText = copyButton.textContent;
    copyButton.disabled = true;
    copyButton.textContent = "📋 Copying...";

    const response = await fetch(`${LESSON_SERVER_URL}/copy-default-unit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        teacherName: window.activeTeacherName,
        unitValue: unitValue,
      }),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      showNotification(`✅ ${result.message}`, "success", 8000);

      // Reload the teacher's lesson data to show the new unit
      await loadTeacherLessons(window.activeTeacherName);

      // Refresh the modal display
      refreshLessonManagementModal();

      console.log("Default unit copied successfully:", result);
    } else {
      if (response.status === 409) {
        showNotification(
          "You already have a unit with this identifier. Please modify your existing unit instead.",
          "error",
          6000
        );
      } else {
        showNotification(
          `Error: ${result.message || "Failed to copy unit"}`,
          "error",
          6000
        );
      }
    }
  } catch (error) {
    console.error("Error copying default unit:", error);
    showNotification(
      "An error occurred while copying the unit. Please try again.",
      "error",
      5000
    );
  } finally {
    copyButton.disabled = false;
    copyButton.textContent = originalText;
  }
}

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
    // NEW: Dialog content for Register Students with improved layout
    const content = `
      <div class="register-students-modal">
        <div class="register-form-grid">
          <div class="form-section teacher-email-section">
            <label class="form-label">Teacher Email Address</label>
            <input type="email" id="teacherEmailInput" placeholder="Your email address" class="form-input" required />
          </div>
          
          <div class="form-section periods-section">
            <label class="form-label">How many class periods do you teach?</label>
            <input type="number" id="numPeriods" min="1" max="10" value="1" class="form-input number-input" required />
          </div>
        </div>
        
        <div class="form-section students-section">
          <label class="form-label">Students per Period</label>
          <div id="studentsPerPeriodInputs" class="students-inputs-container"></div>
        </div>
        
        <div class="summary-section">
          <div class="total-students-display">
            <span class="summary-label">Total Students:</span>
            <span id="totalStudents" class="summary-value">0</span>
          </div>
        </div>
        
        <div class="form-actions">
          <button type="button" id="generateClassCodesBtn" class="btn btn-primary generate-codes-btn">
            Generate Class Codes
          </button>
        </div>
        
        <div id="classCodesResult" class="class-codes-result"></div>
      </div>
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
        container.innerHTML += `
          <div class="period-input-row">
            <label class="period-label">Period ${i}:</label>
            <input type="number" class="studentsInPeriod period-number-input" min="1" value="1" required />
          </div>
        `;
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
          const response = await fetch(`${API_BASE_URL}/generateClassCodes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
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
    const studentCard = e.target.closest(".student-card");
    const firstName =
      studentCard.querySelector(".first-name")?.textContent || "";
    const lastName = studentCard.querySelector(".last-name")?.textContent || "";
    const student = `${firstName} ${lastName}`.trim() || firstName;
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

// Student health buttons - use event delegation since they're added dynamically
document.addEventListener("click", function (e) {
  if (e.target && e.target.classList.contains("health-btn")) {
    const studentCard = e.target.closest(".student-card");
    const firstName =
      studentCard.querySelector(".first-name")?.textContent || "";
    const lastName = studentCard.querySelector(".last-name")?.textContent || "";
    const student = `${firstName} ${lastName}`.trim() || firstName;

    if (student) {
      displayIndividualStudentHealth(student);
      console.log(`Health button clicked for: ${student}`);
    }
  }
});

// Messages button
document.getElementById("messagesBtn")?.addEventListener("click", function () {
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

document.getElementById("feedbackBtn")?.addEventListener("click", function () {
  openFeedbackDialog(); // This will now correctly find the function below
});

// Class Health button
function openFeedbackDialog() {
  window.openGlobalDialog("Feedback & Report an Issue", "");
  const dialogContent = document.getElementById("dialogContent");
  const template = document.getElementById("feedbackDialogTemplate");
  dialogContent.innerHTML = ""; // Clear previous content
  if (template) {
    dialogContent.appendChild(template.content.cloneNode(true));
  } else {
    dialogContent.innerHTML =
      "<p>Error: Feedback form could not be loaded.</p>";
    return;
  }

  const optionsView = dialogContent.querySelector("#feedbackOptionsView");
  const generalView = dialogContent.querySelector("#generalFeedbackView");
  const bugView = dialogContent.querySelector("#bugReportView");

  const showView = (view) => {
    // Hide all views and mark them as hidden for accessibility
    optionsView.style.display = "none";
    optionsView.setAttribute("aria-hidden", "true");

    generalView.style.display = "none";
    generalView.setAttribute("aria-hidden", "true");

    bugView.style.display = "none";
    bugView.setAttribute("aria-hidden", "true");

    // Show the selected view and mark it as visible for accessibility
    view.style.display = "block";
    view.setAttribute("aria-hidden", "false");
  };

  dialogContent.querySelector("#feedback-general-btn").onclick = () =>
    showView(generalView);
  dialogContent.querySelector("#feedback-bug-btn").onclick = () =>
    showView(bugView);
  dialogContent.querySelector("#gfBackBtn").onclick = () =>
    showView(optionsView);
  dialogContent.querySelector("#bugBackBtn").onclick = () =>
    showView(optionsView);

  const submitFeedback = async (type, data) => {
    const payload = {
      parcel: {
        type,
        userType: "teacher",
        ...data,
      },
    };

    try {
      const response = await fetch(`${API_BASE_URL}/submit-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        alert("Thank you! Your feedback has been submitted.");
        window.closeGlobalDialog();
      } else {
        const errorData = await response.json();
        alert(`Submission failed: ${errorData.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error submitting feedback:", error);
      alert("An error occurred. Please check the console and try again.");
    }
  };

  dialogContent.querySelector("#gfSubmitBtn").onclick = () => {
    const data = {
      category: dialogContent.querySelector("#gfCategory").value,
      details: dialogContent.querySelector("#gfDetails").value,
    };
    if (!data.details)
      return alert("Please provide details for your feedback.");
    submitFeedback("general", data);
  };

  dialogContent.querySelector("#bugSubmitBtn").onclick = () => {
    const data = {
      device: dialogContent.querySelector("#bugDevice").value,
      datetime: dialogContent.querySelector("#bugDatetime").value,
      school: "N/A (Teacher)", // School is not relevant for teacher dash
      features: dialogContent.querySelector("#bugFeatures").value,
      details: dialogContent.querySelector("#bugDetails").value,
    };
    if (!data.details) return alert("Please describe the issue in detail.");
    if (!data.datetime) data.datetime = new Date().toISOString();
    submitFeedback("bug", data);
  };
}
document
  .getElementById("classHealthBtn")
  ?.addEventListener("click", async function () {
    console.log("Class Health button clicked");

    // Use the external class health module
    if (typeof initializeClassHealth === "function") {
      await initializeClassHealth(window.activeTeacherUsername);
    } else {
      console.error("initializeClassHealth function not available");
      window.openGlobalDialog(
        "Class Health Error",
        "Class health functionality is not available. Please refresh the page."
      );
    }
  });

// Fetch and display students by class period after login
async function loadTeacherStudents(teacherUsername) {
  try {
    const response = await fetch(`${API_BASE_URL}/teacherDashboard`, {
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
              <div class="student-name">
                <h5 class="first-name">${
                  student.firstName || student.memberName
                }</h5>
                <h5 class="last-name">${student.lastName || ""}</h5>
              </div>
              <p>Checking: $${student.checkingBalance}</p>
              <p>Savings: $${student.savingsBalance}</p>
              <p>Grade: ${student.grade}</p>
              <p>Lessons: ${student.lessonsCompleted}</p>
              <div class="student-card-buttons">
                <button class="message-btn">Message</button>
                <button class="health-btn">Health</button>
              </div>
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

// Fetch and display lessons for the teacher after login
async function loadTeacherLessons(teacherName) {
  try {
    // The lesson server is on port 4000
    const response = await fetch(`${LESSON_SERVER_URL}/lessons/${teacherName}`);
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        window.teacherUnits = data.units || []; // This is the structured data of units with their lessons
        window.allTeacherLessons = data.lessons || []; // This is the flat list of all lessons the teacher has ever created

        // Store master teacher information and content type
        window.masterTeacher = data.masterTeacher || null;
        window.isUsingMasterDefaults = data.isUsingMasterDefaults || false;
        window.hasOwnContent = data.hasOwnContent || false;
        window.contentType = data.contentType || "unknown";

        console.log("Teacher units loaded:", window.teacherUnits);
        console.log(
          "All individual teacher lessons loaded:",
          window.allTeacherLessons
        );

        // Show appropriate notifications based on content type
        if (window.contentType === "default") {
          console.log(
            `📚 Teacher has no content yet - showing default content from master teacher: ${window.masterTeacher}`
          );
          showNotification(
            `📚 Welcome! You don't have any lessons yet. Showing default content from ${window.masterTeacher} to get you started. Create your own lessons to customize your curriculum.`,
            "info",
            8000
          );
        } else if (
          window.contentType === "own" &&
          window.isUsingMasterDefaults
        ) {
          console.log(
            `� Teacher has own content plus access to master content from: ${window.masterTeacher}`
          );
          console.log(`📊 Content breakdown:`, {
            masterContent: window.allTeacherLessons.filter(
              (l) => l.isMasterContent
            ).length,
            ownContent: window.allTeacherLessons.filter(
              (l) => !l.isMasterContent
            ).length,
          });

          // Show a notification to the user about master content
          showMasterTeacherNotification();
        } else if (window.contentType === "own") {
          console.log(`✅ Teacher has their own content loaded`);
        } else if (window.contentType === "master") {
          console.log(`👑 Master teacher content loaded`);
        }

        console.log(
          "Sample unit structure:",
          JSON.stringify(window.teacherUnits[0], null, 2)
        );
        console.log(
          "Sample lesson structure:",
          JSON.stringify(window.allTeacherLessons[0], null, 2)
        );
      } else {
        console.error("Failed to load teacher lessons:", data.message);
        window.teacherUnits = [];
        window.allTeacherLessons = [];
      }
    } else {
      console.error("Failed to load teacher lessons:", response.statusText);
      window.teacherUnits = [];
      window.allTeacherLessons = [];
    }
  } catch (error) {
    console.error("Error fetching teacher lessons:", error);
    window.teacherUnits = [];
    window.allTeacherLessons = [];
  }
}

// Function to show notification about master teacher content
function showMasterTeacherNotification() {
  if (!window.masterTeacher || window.contentType !== "own") return;

  const masterCount = window.allTeacherLessons.filter(
    (l) => l.isMasterContent
  ).length;
  const ownCount = window.allTeacherLessons.filter(
    (l) => !l.isMasterContent
  ).length;

  if (masterCount > 0 && ownCount > 0) {
    showNotification(
      `📚 Your lesson library: ${ownCount} of your own lessons + ${masterCount} additional lessons from ${window.masterTeacher} available for selection`,
      "info",
      6000
    );
  }
}

// Helper function to display notifications (if not already exists)
function showNotification(message, type = "info", duration = 3000) {
  // Try to find existing notification system or create a simple one
  let notificationContainer = document.getElementById("notificationContainer");

  if (!notificationContainer) {
    notificationContainer = document.createElement("div");
    notificationContainer.id = "notificationContainer";
    notificationContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      max-width: 300px;
    `;
    document.body.appendChild(notificationContainer);
  }

  const notification = document.createElement("div");
  notification.style.cssText = `
    background: ${
      type === "success" ? "#d4edda" : type === "error" ? "#f8d7da" : "#d1ecf1"
    };
    color: ${
      type === "success" ? "#155724" : type === "error" ? "#721c24" : "#0c5460"
    };
    border: 1px solid ${
      type === "success" ? "#c3e6cb" : type === "error" ? "#f5c6cb" : "#bee5eb"
    };
    border-radius: 4px;
    padding: 12px 16px;
    margin-bottom: 10px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    animation: slideInRight 0.3s ease-out;
  `;

  notification.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <span style="flex: 1;">${message}</span>
      <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; font-size: 18px; cursor: pointer; margin-left: 10px;">&times;</button>
    </div>
  `;

  notificationContainer.appendChild(notification);

  // Auto remove after duration
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, duration);

  // Add CSS animation if not already added
  if (!document.getElementById("notificationStyles")) {
    const style = document.createElement("style");
    style.id = "notificationStyles";
    style.innerHTML = `
      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
}

// Refresh the lesson management modal display with updated data
function refreshLessonManagementModal() {
  const globalDialog = document.getElementById("globalDialog");
  const dialogTitle = document.getElementById("dialogTitle");

  // Only refresh if the lesson management modal is currently open
  if (
    globalDialog &&
    globalDialog.open &&
    dialogTitle &&
    dialogTitle.textContent === "Lesson Management"
  ) {
    console.log("Refreshing lesson management modal display");
    console.log("Current teacherUnits data:", window.teacherUnits);
    console.log("Current allTeacherLessons data:", window.allTeacherLessons);

    // Clear pending changes when refreshing
    if (window.pendingLessonChanges) {
      window.pendingLessonChanges.clear();
      console.log("Cleared all pending lesson changes on refresh");
    }

    // Call the internal populateAssignedUnits function if it exists
    // Since it's defined inside the modal opening function, we need to recreate it
    const container = document.getElementById("assignedUnitsContainer");
    if (container) {
      console.log("Refreshing assignedUnitsContainer");
      populateAssignedUnitsDisplay(container);
    } else {
      console.error("assignedUnitsContainer not found");
    }

    // Also refresh the dropdowns
    populateMasterLessonSelect();

    // Check if the unit selector function exists and call it
    const unitSelector = document.getElementById("unitSelectForAssignment");
    if (unitSelector) {
      populateUnitSelectorForAssignmentDisplay(unitSelector);
    }
  } else {
    console.log("Lesson management modal is not open, skipping refresh");
  }
}

// Helper function to populate assigned units display
function populateAssignedUnitsDisplay(container) {
  if (!container) return;

  // Show appropriate message if no units are available
  if (
    !window.teacherUnits ||
    !Array.isArray(window.teacherUnits) ||
    window.teacherUnits.length === 0
  ) {
    // If teacher has no content and we're supposed to show defaults, this shouldn't happen
    // because the backend should have provided default units. Show appropriate message.
    const emptyMessage =
      window.contentType === "default"
        ? '<p style="color: rgba(255,255,255,0.7); font-style: italic;">📚 Loading default units... If this persists, please refresh the page.</p>'
        : '<p style="color: rgba(255,255,255,0.7); font-style: italic;">No units created yet. Create and assign units to see them here.</p>';

    container.innerHTML = emptyMessage;

    // If we expect default content but don't have it, reload the data
    if (window.contentType === "default") {
      console.log(
        "Expected default units but none found - reloading teacher data"
      );
      loadTeacherLessons(window.activeTeacherName).then(() => {
        // Retry populating after reload
        if (window.teacherUnits && window.teacherUnits.length > 0) {
          populateAssignedUnitsDisplay(container);
        }
      });
    }
    return;
  }

  container.innerHTML = "";

  // Sort units by unit number before displaying
  const sortedUnits = [...window.teacherUnits].sort((a, b) => {
    const numA = parseInt(a.value.replace("unit", ""), 10);
    const numB = parseInt(b.value.replace("unit", ""), 10);
    return (isNaN(numA) ? 9999 : numA) - (isNaN(numB) ? 9999 : numB);
  });

  sortedUnits.forEach((unit) => {
    console.log("Debug - Unit data:", unit);
    console.log("Debug - Unit.value:", unit.value, "type:", typeof unit.value);
    console.log("Debug - Unit.name:", unit.name, "type:", typeof unit.name);
    console.log("Debug - Unit._id:", unit._id, "type:", typeof unit._id);

    const unitCard = document.createElement("div");
    unitCard.className = "assigned-unit-card";

    // Add visual indicator for default units
    if (unit.isDefaultUnit) {
      unitCard.style.border = "2px dashed rgba(255, 204, 0, 0.5)";
      unitCard.style.background = "rgba(255, 204, 0, 0.1)";
    }

    // Ensure unit.value exists before setting attribute
    if (unit.value) {
      unitCard.setAttribute("data-unit-value", unit.value);
      console.log("Set data-unit-value to:", unit.value);
    } else {
      console.error("Unit has no value property:", unit);
    }

    unitCard.setAttribute("data-unit-id", unit._id || "");

    let lessonsHtml = "";
    if (unit.lessons && Array.isArray(unit.lessons)) {
      lessonsHtml = unit.lessons
        .map((lesson, index) => {
          console.log("Debug - Lesson data:", lesson);
          console.log(
            "Debug - Lesson._id:",
            lesson._id,
            "type:",
            typeof lesson._id
          );

          // Use the lesson's _id if it exists, otherwise try to find it by title matching
          let lessonId = lesson._id;

          if (!lessonId) {
            // Fallback: Find the matching lesson in allTeacherLessons to get the _id
            const matchingLesson = window.allTeacherLessons.find(
              (fullLesson) => fullLesson.lesson_title === lesson.lesson_title
            );
            lessonId = matchingLesson ? matchingLesson._id : "";
          }

          console.log("Debug - Final lesson ID for rendering:", lessonId);

          // Check if this lesson has pending changes
          const hasPendingChanges =
            window.pendingLessonChanges &&
            window.pendingLessonChanges.has(unit.value);

          let pendingLesson = lesson;
          let isChanged = false;

          if (hasPendingChanges) {
            const pendingData = window.pendingLessonChanges.get(unit.value);
            if (pendingData.pendingLessons[index]) {
              pendingLesson = pendingData.pendingLessons[index];
              // Check if this lesson was changed from the original
              const originalLesson = pendingData.originalLessons[index];
              isChanged =
                originalLesson && originalLesson._id !== pendingLesson._id;
              if (isChanged) {
                lessonId = pendingLesson._id; // Use the new lesson ID
              }
            }
          }

          const changeStyle = isChanged
            ? 'style="background-color: rgba(255, 193, 7, 0.2); border: 1px solid rgba(255, 193, 7, 0.5);"'
            : "";

          const changedAttr = isChanged ? 'data-changed="true"' : "";

          return `
              <li data-lesson-id="${lessonId}" ${changedAttr} ${changeStyle}>
                <span>Lesson: ${pendingLesson.lesson_title}</span>
                <div class="lesson-actions">
                  <button class="btn btn-sm btn-danger remove-lesson-btn">Remove</button>
                  <button class="btn btn-sm btn-info replace-lesson-btn">Replace</button>
                </div>
              </li>
            `;
        })
        .join("");
    }

    if (!lessonsHtml) {
      lessonsHtml =
        '<li style="color: rgba(255,255,255,0.7); font-style: italic;">No lessons in this unit yet.</li>';
    }

    const unitTitle = unit.name || `Unit ${unit.number}: ${unit.unitName}`;
    const defaultIndicator =
      unit.isDefaultUnit || window.contentType === "default"
        ? ' <small class="text-muted">(Default unit)</small>'
        : "";

    // Determine if this is a default unit and show appropriate buttons
    const isDefaultUnit =
      unit.isDefaultUnit || window.contentType === "default";
    const actionButtons = isDefaultUnit
      ? `
        <button class="btn btn-warning copy-unit-btn" style="margin-right: 10px;">📋 Copy to My Units</button>
        <button class="btn btn-secondary save-unit-btn" disabled title="Cannot modify default units">🔒 Read Only</button>
      `
      : `<button class="btn btn-primary save-unit-btn">Save Changes to ${unitTitle}</button>`;

    unitCard.innerHTML = `
      <h6>${unitTitle}${defaultIndicator}</h6>
      <ul class="lesson-list-management">
        ${lessonsHtml}
      </ul>
      <div style="margin-top: 15px;">
        ${actionButtons}
      </div>
    `;

    container.appendChild(unitCard);
  });
}

// Helper function to populate unit selector for assignment
function populateUnitSelectorForAssignmentDisplay(unitSelector) {
  if (!unitSelector) return;

  // Clear existing options
  unitSelector.innerHTML = '<option value="">-- Select a unit --</option>';

  // Populate from global teacherUnits, sorting them by unit number
  if (window.teacherUnits && Array.isArray(window.teacherUnits)) {
    const sortedUnits = [...window.teacherUnits].sort((a, b) => {
      const numA = parseInt(a.value.replace("unit", ""), 10);
      const numB = parseInt(b.value.replace("unit", ""), 10);
      return (isNaN(numA) ? 9999 : numA) - (isNaN(numB) ? 9999 : numB);
    });

    sortedUnits.forEach((unit) => {
      const option = document.createElement("option");
      option.value = unit.value;
      option.textContent = unit.name || `Unit ${unit.number}: ${unit.unitName}`;
      unitSelector.appendChild(option);
    });
  }
}

// Parses a YouTube URL or iframe code and returns a standardized embed URL.
// Returns the original input if it's not a recognized YouTube format.
function getYoutubeEmbedUrl(input) {
  if (!input) return null;

  // Regex for standard YouTube watch URLs, short URLs, and embed URLs
  const youtubeRegex =
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

  // Regex for iframe embed code
  const iframeRegex =
    /<iframe[^>]+src="https:\/\/www\.youtube\.com\/embed\/([a-zA-Z0-9_-]{11})"/;

  let match = input.match(youtubeRegex);
  if (match && match[1]) {
    return `https://www.youtube.com/embed/${match[1]}`;
  }

  match = input.match(iframeRegex);
  if (match && match[1]) {
    return `https://www.youtube.com/embed/${match[1]}`;
  }

  // Assume it's a direct video link (e.g., .mp4) if no YouTube match
  return input;
}

// Populates the 'All Available Lessons' dropdown in the lesson management modal.
function populateMasterLessonSelect() {
  const masterSelect = document.getElementById("masterLessonSelect");
  if (!masterSelect) {
    console.error("masterLessonSelect element not found in the DOM.");
    return;
  }

  // Clear existing options but keep a placeholder
  masterSelect.innerHTML =
    '<option value="">-- Select a lesson to replace with --</option>';

  if (window.allTeacherLessons && Array.isArray(window.allTeacherLessons)) {
    // Group lessons by master vs own content
    const ownLessons = window.allTeacherLessons.filter(
      (l) => !l.isMasterContent
    );
    const masterLessons = window.allTeacherLessons.filter(
      (l) => l.isMasterContent
    );

    // Sort lessons alphabetically by title for better UX
    const sortedOwnLessons = ownLessons.sort((a, b) =>
      a.lesson_title.localeCompare(b.lesson_title)
    );
    const sortedMasterLessons = masterLessons.sort((a, b) =>
      a.lesson_title.localeCompare(b.lesson_title)
    );

    // Add own lessons first (if any)
    if (sortedOwnLessons.length > 0) {
      const ownGroup = document.createElement("optgroup");
      ownGroup.label = "📝 Your Own Lessons";
      sortedOwnLessons.forEach((lesson) => {
        const option = document.createElement("option");
        option.value = lesson._id;
        option.textContent = lesson.lesson_title;
        ownGroup.appendChild(option);
      });
      masterSelect.appendChild(ownGroup);
    }

    // Add master lessons (if any)
    if (sortedMasterLessons.length > 0) {
      const masterGroup = document.createElement("optgroup");
      masterGroup.label = `📚 Default Lessons (${
        window.masterTeacher || "Master Teacher"
      })`;
      sortedMasterLessons.forEach((lesson) => {
        const option = document.createElement("option");
        option.value = lesson._id;
        option.textContent = lesson.lesson_title;
        masterGroup.appendChild(option);
      });
      masterSelect.appendChild(masterGroup);
    }

    // If no grouping is needed (all same type), fall back to simple list
    if (sortedOwnLessons.length === 0 || sortedMasterLessons.length === 0) {
      const allSorted = [...window.allTeacherLessons].sort((a, b) =>
        a.lesson_title.localeCompare(b.lesson_title)
      );

      // Clear and repopulate without groups
      masterSelect.innerHTML =
        '<option value="">-- Select a lesson to replace with --</option>';

      allSorted.forEach((lesson) => {
        const option = document.createElement("option");
        option.value = lesson._id;
        const indicator = lesson.isMasterContent ? "📚 " : "📝 ";
        option.textContent = indicator + lesson.lesson_title;
        masterSelect.appendChild(option);
      });
    }
  }
}

// Populates the 'Assign to Unit' dropdown from the window.teacherUnits array
function populateUnitSelector() {
  const unitSelector = document.getElementById("unitSelector");
  if (!unitSelector) {
    console.error("unitSelector not found in the DOM");
    return;
  }

  // Clear existing options (keeping the placeholder)
  while (unitSelector.options.length > 1) {
    unitSelector.remove(1);
  }

  // For lesson creation, only show teacher's own custom units, not default units
  if (window.teacherUnits && Array.isArray(window.teacherUnits)) {
    // Filter to only show custom units (not default units)
    const customUnits = window.teacherUnits.filter(
      (unit) => !unit.isDefaultUnit
    );

    if (customUnits.length === 0) {
      // If teacher has no custom units, show a helpful message
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "-- No custom units created yet --";
      option.disabled = true;
      unitSelector.appendChild(option);
      console.log(
        "No custom units found for teacher - showing placeholder message"
      );
    } else {
      // Sort custom units by unit number
      const sortedUnits = [...customUnits].sort((a, b) => {
        const numA = parseInt(a.value.replace("unit", ""), 10);
        const numB = parseInt(b.value.replace("unit", ""), 10);
        return (isNaN(numA) ? 9999 : numA) - (isNaN(numB) ? 9999 : numB);
      });

      sortedUnits.forEach((unit) => {
        const option = document.createElement("option");
        option.value = unit.value; // e.g., "unit1"
        option.textContent = unit.name; // e.g., "Unit 1: Banking"
        unitSelector.appendChild(option);
      });
      console.log(
        `Populated unit selector with ${sortedUnits.length} custom units`
      );
    }
  } else {
    // If no teacherUnits data available
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "-- Loading units... --";
    option.disabled = true;
    unitSelector.appendChild(option);
  }
}

// Listen for new students being added live via socket.io
const socket = io(API_BASE_URL, {
  withCredentials: true,
});

// Socket.IO connection to lesson server (port 4000)
const lessonSocket = io(LESSON_SERVER_URL, {
  withCredentials: true,
});

// Listen for lesson server events
lessonSocket.on("connect", () => {
  console.log("Connected to lesson server (port 4000)");
  if (window.activeTeacherName) {
    console.log("Identifying with lesson server as:", window.activeTeacherName);
    lessonSocket.emit("identify", window.activeTeacherName);
  } else {
    console.log("No active teacher name set yet");
  }
});

lessonSocket.on("disconnect", () => {
  console.log("Disconnected from lesson server (port 4000)");
});

lessonSocket.on("identified", (data) => {
  console.log("Lesson server identification successful:", data);
});

lessonSocket.on("error", (error) => {
  console.error("Lesson server error:", error);
});

// Test listener to catch any events
lessonSocket.onAny((eventName, ...args) => {
  console.log("Received Socket.IO event:", eventName, args);
});

// Add a global function to test Socket.IO connection
window.testSocketIO = function () {
  console.log("Current teacher name:", window.activeTeacherName);
  console.log("Lesson socket connected:", lessonSocket.connected);
  console.log("Main socket connected:", socket.connected);

  // Test emitting an event
  lessonSocket.emit("test", "Hello from frontend");
};

// Listen for lesson creation events from lesson server
lessonSocket.on("lessonCreated", (data) => {
  const { teacherName, lessonData, unitData } = data;

  // Only update if this is for the current teacher
  if (teacherName === window.activeTeacherName) {
    console.log("New lesson created:", lessonData);
    console.log("Unit data:", unitData);

    // Add lesson to the global lessons array
    if (!window.allTeacherLessons) {
      window.allTeacherLessons = [];
    }
    window.allTeacherLessons.push(lessonData);

    // Update the global units array with the updated unit data
    if (!window.teacherUnits) {
      window.teacherUnits = [];
    }

    // Find and update the existing unit or add new unit
    const unitIndex = window.teacherUnits.findIndex(
      (u) => u.value === unitData.value
    );
    if (unitIndex >= 0) {
      // Update existing unit with new lesson
      window.teacherUnits[unitIndex] = unitData;
      console.log(`Updated existing unit ${unitData.name} with new lesson`);
    } else {
      // Add new unit
      window.teacherUnits.push(unitData);
      console.log(`Added new unit ${unitData.name} with lesson`);
    }

    // Update the All Available Lessons dropdown if it exists
    populateMasterLessonSelect();

    // Refresh the lesson management modal if it's currently open
    refreshLessonManagementModal();

    // Show success notification
    showNotification(
      `Lesson "${lessonData.lesson_title}" added to ${unitData.name}`,
      "success"
    );
  } else {
    console.log("Lesson created for different teacher:", teacherName);
  }
});

// Listen for unit updates from lesson server
lessonSocket.on("unitUpdated", (data) => {
  const { teacherName, unitData } = data;

  // Only update if this is for the current teacher
  if (teacherName === window.activeTeacherName) {
    console.log(
      "Unit updated event received for:",
      unitData.name,
      "- Unit value:",
      unitData.value
    );

    // Update the unit selector dropdown if it exists
    populateUnitSelectorForAssignment();

    // Refresh the lesson management modal if it's open
    const globalDialog = document.getElementById("globalDialog");
    const dialogTitle = document.getElementById("dialogTitle");
    if (
      globalDialog &&
      globalDialog.open &&
      dialogTitle &&
      dialogTitle.textContent === "Lesson Management"
    ) {
      console.log("Refreshing lesson management modal due to unit update");
      loadTeacherLessons(teacherName).then(() => {
        // After data is loaded, refresh the visual display
        refreshLessonManagementModal();
      });
    }

    // Show notification (only one per unit update now)
    showNotification(
      `Unit "${unitData.name}" updated successfully!`,
      "success"
    );
  } else {
    console.log("Unit updated event for different teacher:", teacherName);
  }
});

// Listen for unit assignment from lesson server
lessonSocket.on("unitAssigned", (data) => {
  const { teacherName, unitData, classPeriod } = data;

  // Only update if this is for the current teacher
  if (teacherName === window.activeTeacherName) {
    console.log("Unit assigned:", { unitData, classPeriod });

    // Show notification
    showNotification(
      `Unit "${unitData.name}" assigned to Period ${parseInt(
        classPeriod,
        10
      )}!`,
      "success"
    );
  }
});

// Listen for room-specific lesson events
lessonSocket.on("newLessonAdded", (data) => {
  const { teacherName, lessonData, unitData, timestamp } = data;

  if (teacherName === window.activeTeacherName) {
    console.log("New lesson added (room-specific):", data);

    // Update global data
    if (!window.allTeacherLessons) {
      window.allTeacherLessons = [];
    }

    // Check if lesson already exists to avoid duplicates
    const existingLessonIndex = window.allTeacherLessons.findIndex(
      (l) => l._id === lessonData._id
    );
    if (existingLessonIndex === -1) {
      window.allTeacherLessons.push(lessonData);
    }

    // Update units
    if (!window.teacherUnits) {
      window.teacherUnits = [];
    }

    const unitIndex = window.teacherUnits.findIndex(
      (u) => u.value === unitData.value
    );
    if (unitIndex >= 0) {
      window.teacherUnits[unitIndex] = unitData;
    } else {
      window.teacherUnits.push(unitData);
    }

    refreshLessonManagementModal();
  }
});

// Listen for unit changes applied
lessonSocket.on("unitChangesApplied", (data) => {
  const { teacherName, unitData, timestamp } = data;

  if (teacherName === window.activeTeacherName) {
    console.log("Unit changes applied:", data);

    // Update the unit in global data
    if (window.teacherUnits && Array.isArray(window.teacherUnits)) {
      const unitIndex = window.teacherUnits.findIndex(
        (u) => u.value === unitData.value
      );
      if (unitIndex >= 0) {
        window.teacherUnits[unitIndex] = unitData;
      }
    }

    refreshLessonManagementModal();
    showNotification(
      `Unit "${unitData.name}" changes applied successfully`,
      "success"
    );
  }
});

// Listen for complete refresh events
lessonSocket.on("lessonManagementCompleteRefresh", (data) => {
  const { teacherName, units, lessons, timestamp } = data;

  if (teacherName === window.activeTeacherName) {
    console.log("Complete lesson management refresh:", data);

    // Update global data with fresh data from server
    window.teacherUnits = units || [];
    window.allTeacherLessons = lessons || [];

    // Refresh the modal display
    refreshLessonManagementModal();
    populateMasterLessonSelect();

    showNotification("Lesson management data refreshed", "info");
  }
});

// Listen for lesson management refresh events
lessonSocket.on("lessonManagementRefresh", (data) => {
  const { teacherName, action, lessonData, unitData } = data;

  if (teacherName === window.activeTeacherName) {
    console.log("Lesson management refresh:", data);

    switch (action) {
      case "lessonAdded":
        // Handle lesson added
        if (lessonData && unitData) {
          if (!window.allTeacherLessons) {
            window.allTeacherLessons = [];
          }

          // Check for duplicates
          const existingIndex = window.allTeacherLessons.findIndex(
            (l) => l._id === lessonData._id
          );
          if (existingIndex === -1) {
            window.allTeacherLessons.push(lessonData);
          }

          // Update unit
          if (window.teacherUnits && Array.isArray(window.teacherUnits)) {
            const unitIndex = window.teacherUnits.findIndex(
              (u) => u.value === unitData.value
            );
            if (unitIndex >= 0) {
              window.teacherUnits[unitIndex] = unitData;
            } else {
              window.teacherUnits.push(unitData);
            }
          }
        }
        break;

      case "unitModified":
        // Handle unit modified
        if (
          unitData &&
          window.teacherUnits &&
          Array.isArray(window.teacherUnits)
        ) {
          const unitIndex = window.teacherUnits.findIndex(
            (u) => u.value === unitData.value
          );
          if (unitIndex >= 0) {
            window.teacherUnits[unitIndex] = unitData;
          }
        }
        break;

      case "unitAssigned":
        // Handle unit assigned - could update assignment display
        console.log("Unit assigned:", unitData);
        break;
    }

    // Always refresh the modal after handling the action
    refreshLessonManagementModal();
  }
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
        <div class="student-name">
          <h5 class="first-name">${student.firstName || student.memberName}</h5>
          <h5 class="last-name">${student.lastName || ""}</h5>
        </div>
        <p>Checking: $${student.checkingBalance}</p>
        <p>Savings: $${student.savingsBalance}</p>
        <p>Grade: ${student.grade}</p>
        <p>Lessons: ${student.lessonsCompleted}</p>
        <div class="student-card-buttons">
          <button class="message-btn">Message</button>
          <button class="health-btn">Health</button>
        </div>
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

// --- Socket.IO event listeners for lesson management modal updates from main server ---
// Listen for lesson replacement from main server
socket.on("lessonReplaced", (data) => {
  const { teacherName, unitValue, oldLesson, newLesson } = data;

  // Only update if this is for the current teacher
  if (teacherName === window.activeTeacherName) {
    console.log("Lesson replaced:", { oldLesson, newLesson });

    // Refresh the lesson management modal if it's open
    const globalDialog = document.getElementById("globalDialog");
    const dialogTitle = document.getElementById("dialogTitle");
    if (
      globalDialog &&
      globalDialog.open &&
      dialogTitle &&
      dialogTitle.textContent === "Lesson Management"
    ) {
      console.log(
        "Refreshing lesson management modal due to lesson replacement"
      );
      loadTeacherLessons(teacherName).then(() => {
        // After data is loaded, refresh the visual display
        refreshLessonManagementModal();
      });
    }

    // Show notification
    showNotification(
      `Lesson "${oldLesson.lesson_title}" replaced with "${newLesson.lesson_title}"!`,
      "success"
    );
  }
});

// Listen for unit saved from main server
socket.on("unitSaved", (data) => {
  const { teacherName, unitValue, lessons } = data;

  // Only update if this is for the current teacher
  if (teacherName === window.activeTeacherName) {
    console.log("Unit saved:", { unitValue, lessons });

    // Refresh the lesson management modal if it's open
    const globalDialog = document.getElementById("globalDialog");
    const dialogTitle = document.getElementById("dialogTitle");
    if (
      globalDialog &&
      globalDialog.open &&
      dialogTitle &&
      dialogTitle.textContent === "Lesson Management"
    ) {
      console.log("Refreshing lesson management modal due to unit save");
      loadTeacherLessons(teacherName).then(() => {
        // After data is loaded, refresh the visual display
        refreshLessonManagementModal();
      });
    }

    // Show notification
    showNotification(
      `Unit changes saved successfully! (${lessons.length} lessons)`,
      "success"
    );
  }
});

// Listen for student financial updates to refresh class health dashboard
socket.on("studentFinancialUpdate", (data) => {
  console.log("Received student financial update:", data);

  // Check if this update is for the current teacher
  if (
    window.activeTeacherName &&
    data.teacherName === window.activeTeacherName
  ) {
    console.log(
      `Financial update for ${data.studentName} in ${data.teacherName}'s class - refreshing health dashboard`
    );

    // Check if the class health dashboard is currently visible
    const healthDashboard = document.querySelector(".class-health-dashboard");
    if (healthDashboard) {
      console.log("Class health dashboard is visible, refreshing...");

      // Refresh the class health dashboard using the efficient refresh function
      if (typeof refreshClassHealthDashboard === "function") {
        // Use a small delay to ensure the database has been updated
        setTimeout(async () => {
          try {
            await refreshClassHealthDashboard(window.activeTeacherUsername);
            console.log("Class health dashboard refreshed successfully");
          } catch (error) {
            console.error("Error refreshing class health dashboard:", error);
          }
        }, 500); // 500ms delay to ensure DB consistency
      } else if (typeof initializeClassHealth === "function") {
        // Fallback to full initialization if refresh function is not available
        setTimeout(async () => {
          try {
            await initializeClassHealth(window.activeTeacherUsername);
            console.log(
              "Class health dashboard refreshed successfully (via full init)"
            );
          } catch (error) {
            console.error("Error refreshing class health dashboard:", error);
          }
        }, 500);
      }
    }
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
            <div style="display:flex;gap:0.5em;align-items:center;margin-top:0.3em;">
              <input type="text" id="emailRecipients" placeholder="Type emails or use address book/groups below" style="padding:0.5em;border-radius:6px;border:none;flex:1;" />
              <button type="button" id="clearRecipientsBtn" style="background:#ff6b6b;color:white;border:none;border-radius:4px;padding:0.5em 0.8em;font-size:0.8em;font-weight:600;cursor:pointer;white-space:nowrap;" title="Clear all recipients">Clear</button>
            </div>
            <select id="groupSelect" style="margin-top:0.5em;width:100%;padding:0.4em;border-radius:6px;border:none;">
              <option value="">-- Select Group (optional) --</option>
            </select>
          </div>
          <div style="margin-bottom:0.7em;">
            <label style="font-weight:600;">CC:</label>
            <div style="display:flex;gap:0.5em;align-items:center;margin-top:0.3em;">
              <input type="text" id="emailCC" placeholder="Optional: CC additional recipients" style="padding:0.5em;border-radius:6px;border:none;flex:1;" />
              <button type="button" id="clearCCBtn" style="background:#ff6b6b;color:white;border:none;border-radius:4px;padding:0.5em 0.8em;font-size:0.8em;font-weight:600;cursor:pointer;white-space:nowrap;" title="Clear CC recipients">Clear</button>
            </div>
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
            <p style="font-size:0.8em;color:#ccc;margin:0 0 0.8em 0;">Click "To" or "CC" to add emails to recipients</p>
            <input type="text" id="addressInput" placeholder="Add email address" style="padding:0.4em;border-radius:6px;border:none;width:100%;margin-bottom:0.5em;" />
            <button type="button" id="saveAddressBtn" class="btn btn-sm" style="background:#00ffcc;color:#3b0a70;font-weight:700;width:100%;margin-bottom:0.7em;">Save Address</button>
            <div id="addressBookList" style="max-height:120px;overflow:auto;"></div>
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
            <p style="font-size:0.8em;color:#ccc;margin:0 0 0.8em 0;">Click + to add all group members to recipients</p>
            <input type="text" id="groupNameInput" placeholder="Group Name" style="padding:0.4em;border-radius:6px;border:none;width:100%;margin-bottom:0.5em;" />
            <div id="groupAddressSelect" style="margin-bottom:0.5em;"></div>
            <button type="button" id="saveGroupBtn" class="btn btn-sm" style="background:#00ffcc;color:#3b0a70;font-weight:700;width:100%;">Create Group</button>
            <div id="groupList" style="max-height:80px;overflow:auto;margin-top:0.5em;"></div>
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
  document.getElementById("clearRecipientsBtn").onclick = clearRecipients;
  document.getElementById("clearCCBtn").onclick = clearCC;
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
    
    /* Email address book styling */
    .add-email-btn:hover {
      background: #00d4a3 !important;
      transform: scale(1.05);
    }
    
    .add-cc-btn:hover {
      background: #7e57c2 !important;
      transform: scale(1.05);
    }
    
    .add-group-btn:hover {
      background: #7e57c2 !important;
      transform: scale(1.05);
    }
    
    #clearRecipientsBtn:hover, #clearCCBtn:hover {
      background: #ff5252 !important;
      transform: translateY(-1px);
    }
    
    /* Animation for recipient field feedback */
    #emailRecipients, #emailCC {
      transition: background-color 0.3s ease;
    }
  `;
  document.head.appendChild(style);
})();

// --- Address Book Logic ---
window.addressBook = [];

/**
 * Add email address to the recipients field
 * @param {string} email - Email address to add
 */
window.addEmailToRecipients = function (email) {
  const recipientsField = document.getElementById("emailRecipients");
  if (!recipientsField) return;

  const currentValue = recipientsField.value.trim();
  const emailsArray = currentValue
    ? currentValue.split(",").map((e) => e.trim())
    : [];

  // Check if email is already in the list
  if (emailsArray.includes(email)) {
    // Flash the input to show it's already there
    recipientsField.style.backgroundColor = "rgba(255, 204, 0, 0.3)";
    setTimeout(() => {
      recipientsField.style.backgroundColor = "";
    }, 500);
    return;
  }

  emailsArray.push(email);
  recipientsField.value = emailsArray.join(", ");

  // Visual feedback
  recipientsField.style.backgroundColor = "rgba(0, 255, 204, 0.2)";
  setTimeout(() => {
    recipientsField.style.backgroundColor = "";
  }, 500);

  // Focus the field to show the addition
  recipientsField.focus();
  recipientsField.setSelectionRange(
    recipientsField.value.length,
    recipientsField.value.length
  );
};

/**
 * Add email address to the CC field
 * @param {string} email - Email address to add
 */
window.addEmailToCC = function (email) {
  const ccField = document.getElementById("emailCC");
  if (!ccField) return;

  const currentValue = ccField.value.trim();
  const emailsArray = currentValue
    ? currentValue.split(",").map((e) => e.trim())
    : [];

  // Check if email is already in the list
  if (emailsArray.includes(email)) {
    // Flash the input to show it's already there
    ccField.style.backgroundColor = "rgba(255, 204, 0, 0.3)";
    setTimeout(() => {
      ccField.style.backgroundColor = "";
    }, 500);
    return;
  }

  emailsArray.push(email);
  ccField.value = emailsArray.join(", ");

  // Visual feedback
  ccField.style.backgroundColor = "rgba(149, 117, 205, 0.2)";
  setTimeout(() => {
    ccField.style.backgroundColor = "";
  }, 500);

  // Focus the field to show the addition
  ccField.focus();
  ccField.setSelectionRange(ccField.value.length, ccField.value.length);
};

/**
 * Add all members of a group to the recipients field
 * @param {number} groupIndex - Index of the group in emailGroups array
 */
window.addGroupToRecipients = function (groupIndex) {
  const recipientsField = document.getElementById("emailRecipients");
  if (!recipientsField || !window.emailGroups[groupIndex]) return;

  const group = window.emailGroups[groupIndex];
  const currentValue = recipientsField.value.trim();
  const existingEmails = currentValue
    ? currentValue.split(",").map((e) => e.trim())
    : [];

  // Add group members that aren't already in the list
  let addedCount = 0;
  group.addresses.forEach((email) => {
    if (!existingEmails.includes(email)) {
      existingEmails.push(email);
      addedCount++;
    }
  });

  recipientsField.value = existingEmails.join(", ");

  // Visual feedback
  if (addedCount > 0) {
    recipientsField.style.backgroundColor = "rgba(149, 117, 205, 0.2)";
    setTimeout(() => {
      recipientsField.style.backgroundColor = "";
    }, 500);
  } else {
    // All emails were already in the list
    recipientsField.style.backgroundColor = "rgba(255, 204, 0, 0.3)";
    setTimeout(() => {
      recipientsField.style.backgroundColor = "";
    }, 500);
  }

  // Focus the field
  recipientsField.focus();
  recipientsField.setSelectionRange(
    recipientsField.value.length,
    recipientsField.value.length
  );
};

/**
 * Clear all recipients from the email field
 */
function clearRecipients() {
  const recipientsField = document.getElementById("emailRecipients");
  const groupSelect = document.getElementById("groupSelect");

  if (recipientsField) {
    recipientsField.value = "";
    // Visual feedback
    recipientsField.style.backgroundColor = "rgba(255, 107, 107, 0.2)";
    setTimeout(() => {
      recipientsField.style.backgroundColor = "";
    }, 300);
  }

  // Also reset group selection
  if (groupSelect) {
    groupSelect.value = "";
  }
}

/**
 * Clear all CC recipients from the CC field
 */
function clearCC() {
  const ccField = document.getElementById("emailCC");

  if (ccField) {
    ccField.value = "";
    // Visual feedback
    ccField.style.backgroundColor = "rgba(255, 107, 107, 0.2)";
    setTimeout(() => {
      ccField.style.backgroundColor = "";
    }, 300);
  }
}

function renderAddressBook() {
  const list = document.getElementById("addressBookList");
  if (!list) return;
  list.innerHTML = window.addressBook.length
    ? window.addressBook
        .map(
          (addr, i) =>
            `<div style='display:flex;align-items:center;gap:0.3em;margin-bottom:0.4em;padding:0.3em;background:rgba(255,255,255,0.05);border-radius:6px;'>
               <button type='button' 
                       class='add-email-btn' 
                       onclick='window.addEmailToRecipients("${addr}")' 
                       style='background:#00ffcc;color:#3b0a70;border:none;border-radius:4px;padding:0.2em 0.4em;font-size:0.75em;font-weight:600;cursor:pointer;flex-shrink:0;'
                       title='Add to TO recipients'>
                 To
               </button>
               <button type='button' 
                       class='add-cc-btn' 
                       onclick='window.addEmailToCC("${addr}")' 
                       style='background:#9575cd;color:white;border:none;border-radius:4px;padding:0.2em 0.4em;font-size:0.75em;font-weight:600;cursor:pointer;flex-shrink:0;'
                       title='Add to CC recipients'>
                 CC
               </button>
               <span style='flex:1;font-size:0.85em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-left:0.3em;' title='${addr}'>${addr}</span>
               <button type='button' 
                       style='background:none;border:none;color:#ffb3b3;cursor:pointer;font-size:1.1em;flex-shrink:0;' 
                       onclick='window.removeAddress(${i})' 
                       title='Remove'>
                 &times;
               </button>
             </div>`
        )
        .join("")
    : `<div style='color:#ccc;font-size:0.9em;text-align:center;padding:1em;'>No addresses saved yet.</div>`;
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
    fetch(`${API_BASE_URL}/saveEmailAddress`, {
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
  fetch(`${API_BASE_URL}/saveEmailTemplate`, {
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
    groupList.innerHTML = window.emailGroups.length
      ? window.emailGroups
          .map(
            (g, i) =>
              `<div style='display:flex;align-items:center;gap:0.3em;margin-bottom:0.4em;padding:0.3em;background:rgba(255,255,255,0.05);border-radius:6px;'>
                 <button type='button' 
                         class='add-group-btn' 
                         onclick='window.addGroupToRecipients(${i})' 
                         style='background:#9575cd;color:white;border:none;border-radius:4px;padding:0.2em 0.5em;font-size:0.8em;font-weight:600;cursor:pointer;flex-shrink:0;'
                         title='Add all group members to recipients'>
                   +
                 </button>
                 <span style='flex:1;font-size:0.85em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' title='${g.addresses.join(
                   ", "
                 )}'>${g.name} (${g.addresses.length})</span>
                 <button type='button' 
                         style='background:none;border:none;color:#ffb3b3;cursor:pointer;font-size:1.1em;flex-shrink:0;' 
                         onclick='window.removeGroup(${i})' 
                         title='Remove group'>
                   &times;
                 </button>
               </div>`
          )
          .join("")
      : `<div style='color:#ccc;font-size:0.9em;text-align:center;padding:1em;'>No groups created yet.</div>`;
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
  fetch(`${API_BASE_URL}/saveEmailGroup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: window.activeTeacherUsername || "Unknown",
      name,
      addresses,
    }),
  });
}

/**
 * Display individual student health dashboard
 * @param {string} studentName - The student's full name
 */
async function displayIndividualStudentHealth(studentName) {
  try {
    console.log(`Fetching health data for student: "${studentName}"`);

    // Fetch student's profile data
    const studentsData = await fetchAllStudentFinancialData(
      window.activeTeacherUsername
    );

    // Debug: Log all available student names
    console.log(
      "Available students in data:",
      studentsData.map((s) => ({
        name: s.name,
        username: s.username,
      }))
    );

    // Find the specific student - try multiple matching strategies
    const studentData = studentsData.find((student) => {
      const fullName = `${student.name}`.trim();
      const username = student.username;

      // Strategy 1: Exact match
      if (fullName === studentName || username === studentName) {
        return true;
      }

      // Strategy 2: Check if studentName is contained within the full name
      // (handles cases like "Derryke Sumlin" matching "Derryke Sumlin Jr")
      if (fullName.toLowerCase().includes(studentName.toLowerCase())) {
        return true;
      }

      // Strategy 3: Check if the full name starts with studentName
      // (another way to handle "Jr", "Sr", etc.)
      if (fullName.toLowerCase().startsWith(studentName.toLowerCase())) {
        return true;
      }

      // Strategy 4: Split names and check for substantial match
      // (handles middle names, nicknames, etc.)
      const studentNameParts = studentName
        .toLowerCase()
        .split(" ")
        .filter((part) => part.length > 0);
      const fullNameParts = fullName
        .toLowerCase()
        .split(" ")
        .filter((part) => part.length > 0);

      if (studentNameParts.length >= 2 && fullNameParts.length >= 2) {
        // Check if first and last name match (ignoring middle names/suffixes)
        const firstMatch = studentNameParts[0] === fullNameParts[0];
        const lastMatch =
          studentNameParts[studentNameParts.length - 1] ===
          fullNameParts.find(
            (part) => part === studentNameParts[studentNameParts.length - 1]
          );
        if (firstMatch && lastMatch) {
          return true;
        }
      }

      return false;
    });

    if (!studentData) {
      console.error(`Student matching failed for: "${studentName}"`);
      console.error(
        "Available students:",
        studentsData.map((s) => s.name)
      );

      window.openGlobalDialog(
        "Student Not Found",
        `Could not find financial data for student: "${studentName}"
        
Available students: ${studentsData.map((s) => s.name).join(", ")}

This might be a name matching issue. Please check the console for debugging information.`
      );
      return;
    }

    console.log(
      `Successfully found student data for: "${studentName}" -> matched with: "${studentData.name}"`
    );

    // Calculate the student's health
    const studentHealth = calculateStudentHealth(studentData);
    const healthStatus = getHealthStatus(studentHealth.overallHealth);

    const content = `
      <div class="individual-student-health" style="max-width: 100%; padding: 1rem; color: #fff;">
        <div class="student-header" style="text-align: center; margin-bottom: 2rem; padding: 1.5rem; background: linear-gradient(135deg, rgba(59, 10, 112, 0.8), rgba(0, 255, 204, 0.2)); border-radius: 15px; border: 1px solid rgba(0, 255, 204, 0.3);">
          <div class="student-name" style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem;">${studentName}</div>
          <div class="overall-health" style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
            <div class="health-score" style="font-size: 3rem; font-weight: 700; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3); color: ${
              healthStatus.color
            };">
              ${healthStatus.icon} ${studentHealth.overallHealth}%
            </div>
            <div class="health-label" style="font-size: 1.5rem; font-weight: 600;">${
              healthStatus.label
            } Financial Health</div>
          </div>
        </div>

        <div class="financial-summary" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem;">
          <div class="balances" style="background: rgba(59, 10, 112, 0.4); border-radius: 12px; padding: 1.5rem; border: 1px solid rgba(0, 255, 204, 0.2);">
            <h4 style="color: #00ffcc; margin-bottom: 1rem; font-weight: 600;">Account Balances</h4>
            <div style="display: flex; flex-direction: column; gap: 0.8rem;">
              <div style="display: flex; justify-content: space-between;">
                <span>Checking:</span>
                <span style="font-weight: 600; color: #00ffcc;">$${
                  studentHealth.financialData.totalBalance -
                  (studentData.savingsBalance || 0)
                }</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>Savings:</span>
                <span style="font-weight: 600; color: #00ffcc;">$${
                  studentData.savingsBalance || 0
                }</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding-top: 0.5rem; border-top: 1px solid rgba(255, 255, 255, 0.2);">
                <span style="font-weight: 600;">Total Balance:</span>
                <span style="font-weight: 700; color: #00ffcc;">$${
                  studentHealth.financialData.totalBalance
                }</span>
              </div>
            </div>
          </div>

          <div class="cash-flow" style="background: rgba(59, 10, 112, 0.4); border-radius: 12px; padding: 1.5rem; border: 1px solid rgba(0, 255, 204, 0.2);">
            <h4 style="color: #00ffcc; margin-bottom: 1rem; font-weight: 600;">Monthly Cash Flow</h4>
            <div style="display: flex; flex-direction: column; gap: 0.8rem;">
              <div style="display: flex; justify-content: space-between;">
                <span>Income:</span>
                <span style="font-weight: 600; color: #4CAF50;">$${
                  studentHealth.financialData.monthlyIncome
                }</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>Expenses:</span>
                <span style="font-weight: 600; color: #FF9800;">$${
                  studentHealth.financialData.monthlyBills
                }</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding-top: 0.5rem; border-top: 1px solid rgba(255, 255, 255, 0.2);">
                <span style="font-weight: 600;">Net Income:</span>
                <span style="font-weight: 700; color: ${
                  studentHealth.financialData.monthlyIncome -
                    studentHealth.financialData.monthlyBills >=
                  0
                    ? "#4CAF50"
                    : "#F44336"
                };">
                  $${
                    studentHealth.financialData.monthlyIncome -
                    studentHealth.financialData.monthlyBills
                  }
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="health-factors" style="background: rgba(59, 10, 112, 0.4); border-radius: 12px; padding: 1.5rem; border: 1px solid rgba(0, 255, 204, 0.2); margin-bottom: 2rem;">
          <h4 style="color: #00ffcc; margin-bottom: 1rem; font-weight: 600;">Health Factor Breakdown</h4>
          <div class="factors-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            ${Object.entries(studentHealth.factors)
              .map(([factor, score]) => {
                const factorStatus = getHealthStatus(score);
                const factorName =
                  {
                    grade: "Academic Grade",
                    checking: "Bill Coverage",
                    savings: "Basic Savings",
                    incomeRatio: "Income Ratio",
                    emergencyFund: "Emergency Fund",
                    debt: "Debt Health",
                  }[factor] || factor;
                const weight = studentHealth.weights[factor] * 100;

                return `
                  <div class="factor-item" style="display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem; background: rgba(0, 0, 0, 0.2); border-radius: 8px;">
                    <div class="factor-header" style="display: flex; justify-content: between; align-items: center;">
                      <div class="factor-name" style="font-size: 0.9rem; font-weight: 600;">${factorName}</div>
                      <div class="factor-weight" style="font-size: 0.8rem; opacity: 0.7;">${weight}% weight</div>
                    </div>
                    <div class="factor-score" style="font-size: 1.2rem; font-weight: 700; color: ${
                      factorStatus.color
                    };">
                      ${factorStatus.icon} ${Math.round(score)}%
                    </div>
                    <div class="factor-bar" style="height: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 4px; overflow: hidden;">
                      <div class="factor-fill" style="height: 100%; background: linear-gradient(90deg, ${
                        factorStatus.color
                      }, ${
                  factorStatus.color
                }88); width: ${score}%; border-radius: 4px;"></div>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>

        <div class="recommendations" style="background: rgba(59, 10, 112, 0.4); border-radius: 12px; padding: 1.5rem; border: 1px solid rgba(0, 255, 204, 0.2);">
          <h4 style="color: #FF9800; margin-bottom: 1rem; font-weight: 600;">💡 Recommendations for Improvement</h4>
          <div class="recommendations-list">
            ${
              generateRecommendations(studentHealth).length > 0
                ? generateRecommendations(studentHealth)
                    .map(
                      (recommendation) => `
                    <div style="padding: 0.8rem; background: rgba(0, 0, 0, 0.2); border-radius: 8px; margin-bottom: 0.8rem; border-left: 3px solid #FF9800;">
                      <span style="font-size: 0.9rem;">${recommendation}</span>
                    </div>
                  `
                    )
                    .join("")
                : `<div style="padding: 1rem; text-align: center; color: #4CAF50; font-weight: 600;">
                   🎉 Excellent work! Keep maintaining these healthy financial habits.
                 </div>`
            }
          </div>
        </div>

        <div class="health-actions" style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; padding: 1rem; background: rgba(0, 0, 0, 0.1); border-radius: 12px; border: 1px solid rgba(0, 255, 204, 0.2); margin-top: 1.5rem;">
          <button type="button" id="sendStudentHealthMessageBtn" class="btn" style="padding: 0.8rem 1.5rem; border-radius: 8px; border: none; background: linear-gradient(135deg, #00ffcc, #3b0a70); color: #fff; font-weight: 600; cursor: pointer;">
            📧 Send Health Report to Student
          </button>
          <button type="button" id="exportStudentHealthBtn" class="btn" style="padding: 0.8rem 1.5rem; border-radius: 8px; border: none; background: linear-gradient(135deg, #00ffcc, #3b0a70); color: #fff; font-weight: 600; cursor: pointer;">
            📊 Export Student Report
          </button>
        </div>
      </div>
    `;

    window.openGlobalDialog(
      `${studentName} - Financial Health Report`,
      content
    );

    // Add event listeners for the action buttons
    document
      .getElementById("sendStudentHealthMessageBtn")
      ?.addEventListener("click", () => {
        sendStudentHealthMessage(studentName, studentHealth);
      });

    document
      .getElementById("exportStudentHealthBtn")
      ?.addEventListener("click", () => {
        exportStudentHealthReport(studentName, studentData, studentHealth);
      });
  } catch (error) {
    console.error("Error displaying individual student health:", error);
    window.openGlobalDialog(
      "Error",
      `Unable to load health data for ${studentName}. Please try again.`
    );
  }
}

/**
 * Send health report message to individual student
 * @param {string} studentName - Student's name
 * @param {Object} studentHealth - Student's health data
 */
function sendStudentHealthMessage(studentName, studentHealth) {
  const healthStatus = getHealthStatus(studentHealth.overallHealth);
  const strongestFactor = getStrongestFactor(studentHealth.factors);

  const message = `
Hi ${studentName}!

Here's your personal financial health report:

Overall Health: ${healthStatus.icon} ${studentHealth.overallHealth}% (${
    healthStatus.label
  })

Your strongest area: ${strongestFactor}
Monthly Income: $${studentHealth.financialData.monthlyIncome}
Monthly Expenses: $${studentHealth.financialData.monthlyBills}
Net Income: $${
    studentHealth.financialData.monthlyIncome -
    studentHealth.financialData.monthlyBills
  }

${
  generateRecommendations(studentHealth).length > 0
    ? "Areas for improvement:\n" +
      generateRecommendations(studentHealth)
        .map((rec) => `• ${rec}`)
        .join("\n")
    : "🎉 Great job! Keep up the excellent financial habits!"
}

Keep building your financial literacy skills!
  `.trim();

  window.openGlobalDialog(
    `Send Health Report to ${studentName}`,
    `Send personalized financial health report:`,
    {
      recipient: studentName,
      onSend: (messageContent) => {
        const finalMessage = messageContent || message;
        // Use the helper function
        if (typeof window.sendStudentHealthMessage === "function") {
          window.sendStudentHealthMessage(studentName, finalMessage);
        } else {
          console.error(
            "sendStudentHealthMessage helper function not available"
          );
          window.closeGlobalDialog();
        }
      },
    }
  );
}

/**
 * Export individual student health report
 * @param {string} studentName - Student's name
 * @param {Object} studentData - Student's raw data
 * @param {Object} studentHealth - Student's calculated health
 */
function exportStudentHealthReport(studentName, studentData, studentHealth) {
  const report = {
    generatedAt: new Date().toISOString(),
    studentName: studentName,
    rawData: studentData,
    healthCalculation: studentHealth,
    summary: {
      overallHealth: studentHealth.overallHealth,
      strongestFactor: getStrongestFactor(studentHealth.factors),
      weakestFactor: getWeakestFactor(studentHealth.factors),
      recommendations: generateRecommendations(studentHealth),
    },
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${studentName.replace(/\s+/g, "-")}-health-report-${
    new Date().toISOString().split("T")[0]
  }.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  const cc = document.getElementById("emailCC").value.trim();
  const subject = document.getElementById("emailSubject").value.trim();
  const message = document.getElementById("emailMessage").value.trim();
  if (!recipients) return alert("Please enter at least one recipient.");

  // Send to backend for logging and possible delivery
  fetch(`${API_BASE_URL}/sendEmail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: window.activeTeacherUsername || "Unknown",
      recipients,
      cc: cc || null, // Include CC if provided
      subject,
      message,
    }),
  })
    .then((response) => {
      if (response.ok) {
        const ccText = cc ? `\nCC: ${cc}` : "";
        alert(`Email sent to: ${recipients}${ccText}\nSubject: ${subject}`);
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
