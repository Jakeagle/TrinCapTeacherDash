// Get sign-on dialog from the DOM
const signOnDialog = document.getElementById("signOnDialog");
const messagesDialog = document.getElementById("messagesDialog");
// This will be the new central data store for all message threads
window.messageThreads = new Map();
window.teacherUnits = [];
window.allTeacherLessons = [];
const API_BASE_URL = "https://tcstudentserver-production.up.railway.app";

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
        const response = await fetch(`${API_BASE_URL}/findTeacher`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parcel: [username, hashedPin] }),
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
          if (navbarText) navbarText.textContent = teacherName;

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
            })
            .catch((err) => {
              window.addressBook = [];
              window.emailTemplates = [];
              window.emailGroups = [];
              renderAddressBook();
              renderEmailTemplates();
              renderGroups();
            });
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
      // --- HTML Structure for the Lesson Builder ---
      const content = `
      <div class="lesson-modal-layout">
        <div class="lesson-modal-container">
          <form id="createLessonForm" class="lesson-form-main">
            <div class="form-group">
              <label for="lessonTitle">Lesson Title</label>
              <input type="text" id="lessonTitle" class="dialog-input" placeholder="e.g., Introduction to Budgeting" required />
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
            <button type="button" id="uploadToWhirlpoolBtn" class="btn btn-modal-action">Upload to Whirlpool</button>
            <button type="submit" form="createLessonForm" id="saveLessonBtn" class="btn">Save Lesson</button>
        </div>
      </div>
    `;

      window.openGlobalDialog("Create Lesson", "");
      const dialogContent = document.getElementById("dialogContent");
      dialogContent.innerHTML = content;

      populateUnitSelector();

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
              <option value="bank_balance_above">Bank Balance Is Above</option>
              <option value="elapsed_time">Time in Lesson (Seconds)</option>
              <option value="quiz_score_below">Quiz Score Is Below</option>
            </select>
            <input type="number" class="dialog-input condition-value" placeholder="Value" style="max-width: 100px;">
          </div>
          <div class="form-group">
            <label>Then</label>
            <select class="dialog-input action-type">
              <option value="send_message">Send Message</option>
              <option value="add_text_block">Add Text Block</option>
              <option value="restart_student">Restart Student</option>
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
        if (actionType === "send_message" || actionType === "add_text_block") {
          detailsHTML = `<textarea class="dialog-textarea action-content" placeholder="Enter content for action..."></textarea>`;
        }
        detailsContainer.innerHTML = detailsHTML;
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

      dialogContent.addEventListener("click", (e) => {
        if (e.target.classList.contains("remove-btn")) {
          e.target.closest(".content-block, .condition-block").remove();
        }
      });

      dialogContent.addEventListener("change", (e) => {
        if (e.target.classList.contains("action-type")) {
          updateActionDetails(e.target);
        }
      });

      // Add live preview for video URLs
      dialogContent.addEventListener("input", (e) => {
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
      });

      // --- Save/Submit Handler ---
      document
        .getElementById("createLessonForm")
        .addEventListener("submit", async (e) => {
          e.preventDefault();

          const unitSelector = document.getElementById("unitSelector");
          const selectedUnitValue = unitSelector.value;

          if (!selectedUnitValue) {
            alert("Please select a unit before saving the lesson.");
            return; // Prevent server call if no unit is selected
          }

          const selectedUnitName =
            unitSelector.options[unitSelector.selectedIndex].text;

          const lessonData = {
            lesson_title: document.getElementById("lessonTitle").value,
            intro_text_blocks: [],
            conditions: [],
          };

          // Collect intro blocks
          document
            .querySelectorAll("#introBlocksContainer .content-block")
            .forEach((block) => {
              const type = block.dataset.blockType;
              const input = block.querySelector("input, textarea");
              const blockData = { type };
              if (type === "video") {
                // Use the helper function to get a clean embed URL
                blockData.url = getYoutubeEmbedUrl(input.value);
              } else {
                blockData.content = input.value;
              }
              lessonData.intro_text_blocks.push(blockData);
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
              lessonData.conditions.push(condition);
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
            const response = await fetch(`https://tclessonserver-production.up.railway.app/save-lesson`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(parcel),
            });

            if (response.ok) {
              const result = await response.json();
              console.log("Lesson saved successfully:", result);
              alert(
                "Lesson saved successfully! The server has logged the data."
              );
              // window.closeGlobalDialog(); // You can uncomment this to close the dialog on save
            } else {
              console.error("Failed to save lesson:", response.statusText);
              alert(`Error: Failed to save lesson. Status: ${response.status}`);
            }
          } catch (error) {
            console.error("Error sending lesson data:", error);
            alert(
              "An error occurred while saving the lesson. Check the console."
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

          // Check if unit already exists in the dropdown to avoid duplicates
          const exists = Array.from(unitSelector.options).some(
            (opt) => opt.value === unitValue
          );

          if (exists) {
            alert("A unit with this number already exists.");
            return;
          }

          // Add to the global teacherUnits array
          if (!window.teacherUnits) {
            window.teacherUnits = [];
          }
          // This is a temporary client-side addition. The server will create the
          // unit permanently when a lesson is saved to it.
          window.teacherUnits.push({
            value: unitValue,
            name: unitText,
            lessons: [],
          });

          // Add to the dropdown and select it
          const newOption = document.createElement("option");
          newOption.value = unitValue;
          newOption.textContent = unitText;
          unitSelector.appendChild(newOption);
          newOption.selected = true;

          // Hide the form and reset
          document.getElementById("cancelNewUnitBtn").click();
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
                  const response = await fetch(
                    `https://tclessonserver-production.up.railway.app/assign-unit`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        teacherName: window.activeTeacherName,
                        unitValue: selectedUnitValue,
                        classPeriod: selectedPeriod,
                      }),
                    }
                  );

                  const result = await response.json();

                  if (response.ok && result.success) {
                    alert(
                      `Successfully assigned '${selectedUnitName}' to Period ${parseInt(
                        selectedPeriod,
                        10
                      )}.`
                    );
                    window.closeGlobalDialog();
                    // Refresh the lesson view to show the assignment status
                    loadTeacherLessons(window.activeTeacherName);
                  } else {
                    alert(
                      `Error: ${result.message || "Failed to assign unit."}`
                    );
                  }
                } catch (error) {
                  console.error("Error assigning unit:", error);
                  alert("A network error occurred. Please try again.");
                }
              },
              { once: true }
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
            intro_text_blocks: [],
            conditions: [],
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
              lessonData.intro_text_blocks.push(blockData);
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
              lessonData.conditions.push(condition);
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
              `https://tclessonserver-production.up.railway.app/upload-whirlpool`,
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
    });

  document
    .getElementById("lessonManagementBtn")
    ?.addEventListener("click", function () {
      const content = `
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
              <small style="font-size: 0.8em; color: rgba(255,255,255,0.7); margin-top: 0.5em;">To replace a lesson, select one from this list, then click "Replace" on a lesson to the left.</small>
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

      // Populate the assigned units container
      populateAssignedUnits();

      // Populate the dropdowns
      populateMasterLessonSelect();
      populateUnitSelectorForAssignment();

      // Function to populate assigned units from teacherUnits data
      function populateAssignedUnits() {
        const container = document.getElementById("assignedUnitsContainer");
        if (!container) return;

        if (
          !window.teacherUnits ||
          !Array.isArray(window.teacherUnits) ||
          window.teacherUnits.length === 0
        ) {
          container.innerHTML =
            '<p style="color: rgba(255,255,255,0.7); font-style: italic;">No units assigned yet. Create and assign units to see them here.</p>';
          return;
        }

        container.innerHTML = "";

        window.teacherUnits.forEach((unit) => {
          // Debug logging
          console.log("Debug - Unit data:", unit);
          console.log("Debug - Unit._id:", unit._id, "type:", typeof unit._id);

          const unitCard = document.createElement("div");
          unitCard.className = "assigned-unit-card";
          unitCard.setAttribute("data-unit-value", unit.value);
          unitCard.setAttribute("data-unit-id", unit._id || "");

          let lessonsHtml = "";
          if (unit.lessons && Array.isArray(unit.lessons)) {
            lessonsHtml = unit.lessons
              .map((lesson) => {
                // Debug logging for lessons
                console.log("Debug - Lesson data:", lesson);
                console.log(
                  "Debug - Lesson._id:",
                  lesson._id,
                  "type:",
                  typeof lesson._id
                );

                // Find the matching lesson in allTeacherLessons to get the _id
                const matchingLesson = window.allTeacherLessons.find(
                  (fullLesson) =>
                    fullLesson.lesson_title === lesson.lesson_title
                );

                const lessonId = matchingLesson ? matchingLesson._id : "";
                console.log("Debug - Matched lesson ID:", lessonId);

                return `
                    <li data-lesson-id="${lessonId}">
                      <span>Lesson: ${lesson.lesson_title}</span>
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

          unitCard.innerHTML = `
            <h6>${unit.name || `Unit ${unit.number}: ${unit.unitName}`}</h6>
            <ul class="lesson-list-management">
              ${lessonsHtml}
            </ul>
            <button class="btn btn-primary save-unit-btn">Save Changes to ${
              unit.name || unit.unitName
            }</button>
          `;

          container.appendChild(unitCard);
        });
      }

      // Function to populate unit selector for assignment
      function populateUnitSelectorForAssignment() {
        const unitSelector = document.getElementById("unitSelectForAssignment");
        if (!unitSelector) {
          console.error("unitSelectForAssignment not found in the DOM");
          return;
        }

        // Clear existing options
        unitSelector.innerHTML =
          '<option value="">-- Select a unit --</option>';

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
            option.textContent =
              unit.name || `Unit ${unit.number}: ${unit.unitName}`;
            unitSelector.appendChild(option);
          });
        }
      }

      // Event delegation for dynamically created buttons inside the dialog
      document
        .getElementById("dialogContent")
        .addEventListener("click", function (e) {
          if (e.target.classList.contains("remove-lesson-btn")) {
            const lessonItem = e.target.closest("li");
            if (lessonItem) {
              lessonItem.remove();
              console.log("Lesson item removed from view.");
            }
          } else if (e.target.classList.contains("replace-lesson-btn")) {
            handleLessonReplace(e.target);
          } else if (e.target.classList.contains("save-unit-btn")) {
            handleSaveUnit(e.target);
          }
        });

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

      // Function to handle lesson replacement
      async function handleLessonReplace(replaceButton) {
        const masterLessonSelect =
          document.getElementById("masterLessonSelect");
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
        const oldLessonId = lessonItem.getAttribute("data-lesson-id");
        const unitCard = lessonItem.closest(".assigned-unit-card");
        const unitValue = unitCard.getAttribute("data-unit-value");

        // Debug logging
        console.log("Debug - Replace lesson data:");
        console.log("Lesson item clicked:", lessonItem);
        console.log(
          "Full lesson data:",
          JSON.stringify(lessonItem.dataset, null, 2)
        );
        console.log("Unit card:", unitCard);
        console.log(
          "Full unit data:",
          JSON.stringify(unitCard.dataset, null, 2)
        );
        console.log("oldLessonId:", oldLessonId, "type:", typeof oldLessonId);
        console.log("unitValue:", unitValue, "type:", typeof unitValue);
        console.log(
          "selectedLessonId:",
          selectedLessonId,
          "type:",
          typeof selectedLessonId
        );

        if (!oldLessonId || !unitValue) {
          console.error(
            "Missing IDs - oldLessonId:",
            oldLessonId,
            "unitValue:",
            unitValue
          );
          console.error("Unit card dataset:", unitCard.dataset);
          console.error("Lesson item dataset:", lessonItem.dataset);
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

        try {
          // Show loading state
          replaceButton.disabled = true;
          replaceButton.textContent = "Replacing...";

          // Debug the request payload
          const requestPayload = {
            teacherName: window.activeTeacherName,
            unitValue: unitValue,
            oldLessonId: oldLessonId,
            newLessonId: selectedLessonId,
          };
          console.log("Debug - Request payload:", requestPayload);

          // Send the replacement request to the server
          const response = await fetch(`${API_BASE_URL}/replaceLessonInUnit`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestPayload),
          });

          const result = await response.json();

          if (response.ok && result.success) {
            // Update the UI to show the new lesson
            lessonSpan.textContent = `Lesson: ${selectedLessonText}`;
            lessonItem.setAttribute("data-lesson-id", selectedLessonId);

            // Update the local teacherUnits data
            if (window.teacherUnits && Array.isArray(window.teacherUnits)) {
              const unit = window.teacherUnits.find(
                (u) => u.value === unitValue
              );
              if (unit && unit.lessons) {
                const lessonIndex = unit.lessons.findIndex(
                  (l) => l._id === oldLessonId
                );
                if (lessonIndex !== -1) {
                  // Find the new lesson data from allTeacherLessons
                  const newLessonData = window.allTeacherLessons.find(
                    (l) => l._id === selectedLessonId
                  );
                  if (newLessonData) {
                    unit.lessons[lessonIndex] = {
                      _id: selectedLessonId,
                      lesson_title: newLessonData.lesson_title,
                      intro_text_blocks: newLessonData.intro_text_blocks,
                      conditions: newLessonData.conditions,
                    };
                  }
                }
              }
            }

            alert(`Lesson replaced successfully with "${selectedLessonText}"`);

            // Reset the dropdown
            masterLessonSelect.selectedIndex = 0;
          } else {
            alert(`Error: ${result.message || "Failed to replace lesson"}`);
          }
        } catch (error) {
          console.error("Error replacing lesson:", error);
          alert(
            "An error occurred while replacing the lesson. Please try again."
          );
        } finally {
          // Reset button state
          replaceButton.disabled = false;
          replaceButton.textContent = "Replace";
        }
      }
    });

  // Handle saving unit changes
  async function handleSaveUnit(saveButton) {
    const unitCard = saveButton.closest(".assigned-unit-card");
    if (!unitCard) {
      alert("Unable to find unit information. Please try again.");
      return;
    }

    const unitValue = unitCard.getAttribute("data-unit-value");
    if (!unitValue) {
      alert("Unable to find unit identifier. Please try again.");
      return;
    }

    // Extract lessons from the unit card
    const lessonItems = unitCard.querySelectorAll(".lesson-list-management li");
    const lessons = [];

    lessonItems.forEach((lessonItem) => {
      const lessonId = lessonItem.getAttribute("data-lesson-id");
      const lessonText = lessonItem.querySelector("span")?.textContent;

      if (
        lessonId &&
        lessonText &&
        lessonText !== "No lessons in this unit yet."
      ) {
        // Find the full lesson data from allTeacherLessons
        const fullLesson = window.allTeacherLessons.find(
          (l) => l._id === lessonId
        );
        if (fullLesson) {
          lessons.push({
            lesson_title: fullLesson.lesson_title,
            intro_text_blocks: fullLesson.intro_text_blocks,
            conditions: fullLesson.conditions,
          });
        }
      }
    });

    // Debug logging
    console.log("Saving unit:", unitValue);
    console.log("Lessons to save:", lessons);

    try {
      const originalText = saveButton.textContent;
      saveButton.disabled = true;
      saveButton.textContent = "Saving...";

      const response = await fetch(`${API_BASE_URL}/saveUnitChanges`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teacherName: window.activeTeacherName,
          unitValue: unitValue,
          lessons: lessons,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        alert(
          `Unit changes saved successfully! ${result.lessonsCount} lessons saved.`
        );

        // Update the local data
        if (window.teacherUnits && Array.isArray(window.teacherUnits)) {
          const unit = window.teacherUnits.find((u) => u.value === unitValue);
          if (unit) {
            unit.lessons = lessons;
          }
        }

        // Visual feedback - briefly change button color
        saveButton.style.backgroundColor = "#28a745";
        saveButton.textContent = "Saved!";

        setTimeout(() => {
          saveButton.style.backgroundColor = "";
          saveButton.textContent = originalText;
        }, 2000);
      } else {
        alert(`Error: ${result.message || "Failed to save unit changes"}`);
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

// Fetch and display lessons for the teacher after login
async function loadTeacherLessons(teacherName) {
  try {
    // The lesson server is on port 4000
    const response = await fetch(
      `https://tclessonserver-production.up.railway.app/lessons/${teacherName}`
    );
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        window.teacherUnits = data.units || []; // This is the structured data of units with their lessons
        window.allTeacherLessons = data.lessons || []; // This is the flat list of all lessons the teacher has ever created
        console.log("Teacher units loaded:", window.teacherUnits);
        console.log(
          "Sample unit structure:",
          JSON.stringify(window.teacherUnits[0], null, 2)
        );
        console.log(
          "All individual teacher lessons loaded:",
          window.allTeacherLessons
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

  if (
    !window.teacherUnits ||
    !Array.isArray(window.teacherUnits) ||
    window.teacherUnits.length === 0
  ) {
    container.innerHTML =
      '<p style="color: rgba(255,255,255,0.7); font-style: italic;">No units assigned yet. Create and assign units to see them here.</p>';
    return;
  }

  container.innerHTML = "";

  window.teacherUnits.forEach((unit) => {
    console.log("Debug - Unit data:", unit);
    console.log("Debug - Unit._id:", unit._id, "type:", typeof unit._id);

    const unitCard = document.createElement("div");
    unitCard.className = "assigned-unit-card";
    unitCard.setAttribute("data-unit-value", unit.value);
    unitCard.setAttribute("data-unit-id", unit._id || "");

    let lessonsHtml = "";
    if (unit.lessons && Array.isArray(unit.lessons)) {
      lessonsHtml = unit.lessons
        .map((lesson) => {
          console.log("Debug - Lesson data:", lesson);
          console.log(
            "Debug - Lesson._id:",
            lesson._id,
            "type:",
            typeof lesson._id
          );

          // Find the matching lesson in allTeacherLessons to get the _id
          const matchingLesson = window.allTeacherLessons.find(
            (fullLesson) => fullLesson.lesson_title === lesson.lesson_title
          );

          const lessonId = matchingLesson ? matchingLesson._id : "";
          console.log("Debug - Matched lesson ID:", lessonId);

          return `
              <li data-lesson-id="${lessonId}">
                <span>Lesson: ${lesson.lesson_title}</span>
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

    unitCard.innerHTML = `
      <h6>${unit.name || `Unit ${unit.number}: ${unit.unitName}`}</h6>
      <ul class="lesson-list-management">
        ${lessonsHtml}
      </ul>
      <button class="btn btn-primary save-unit-btn">Save Changes to ${
        unit.name || unit.unitName
      }</button>
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
    // Sort lessons alphabetically by title for better UX
    const sortedLessons = [...window.allTeacherLessons].sort((a, b) =>
      a.lesson_title.localeCompare(b.lesson_title)
    );

    sortedLessons.forEach((lesson) => {
      const option = document.createElement("option");
      option.value = lesson._id; // The unique ID from the 'Lessons' collection
      option.textContent = lesson.lesson_title;
      masterSelect.appendChild(option);
    });
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

  // Populate from global teacherUnits, sorting them by unit number
  if (window.teacherUnits && Array.isArray(window.teacherUnits)) {
    // A simple sort based on the numeric part of the 'value' string
    const sortedUnits = [...window.teacherUnits].sort((a, b) => {
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
  }
}

// Listen for new students being added live via socket.io
const socket = io(API_BASE_URL, {
  withCredentials: true,
});

// Socket.IO connection to lesson server (port 4000)
const lessonSocket = io("http://localhost:4000", {
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

    // Update the All Available Lessons dropdown if it exists
    populateMasterLessonSelect();

    // Refresh the lesson management modal if it's open
    const globalDialog = document.getElementById("globalDialog");
    const dialogTitle = document.getElementById("dialogTitle");
    if (
      globalDialog &&
      globalDialog.open &&
      dialogTitle &&
      dialogTitle.textContent === "Lesson Management"
    ) {
      console.log("Refreshing lesson management modal due to new lesson");
      console.log(
        "Before loadTeacherLessons - teacherUnits:",
        window.teacherUnits
      );
      loadTeacherLessons(teacherName).then(() => {
        console.log(
          "After loadTeacherLessons - teacherUnits:",
          window.teacherUnits
        );
        // After data is loaded, refresh the visual display
        refreshLessonManagementModal();
      });
    } else {
      console.log("Lesson management modal is not open, skipping refresh");
    }

    // Show notification
    showNotification(
      `New lesson "${lessonData.lesson_title}" created successfully!`,
      "success"
    );
  } else {
    console.log(
      "Lesson created for different teacher:",
      teacherName,
      "vs",
      window.activeTeacherName
    );
  }
});

// Listen for unit updates from lesson server
lessonSocket.on("unitUpdated", (data) => {
  const { teacherName, unitData } = data;

  // Only update if this is for the current teacher
  if (teacherName === window.activeTeacherName) {
    console.log("Unit updated:", unitData);

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

    // Show notification
    showNotification(
      `Unit "${unitData.name}" updated successfully!`,
      "success"
    );
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

// Helper function to show notifications
function showNotification(message, type = "info") {
  // Create notification element
  const notification = document.createElement("div");
  notification.className = `notification notification-${type}`;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${
      type === "success" ? "#28a745" : type === "error" ? "#dc3545" : "#007bff"
    };
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    z-index: 10000;
    font-weight: 500;
    max-width: 300px;
    word-wrap: break-word;
    opacity: 0;
    transition: opacity 0.3s ease;
  `;
  notification.textContent = message;

  // Add to DOM
  document.body.appendChild(notification);

  // Fade in
  setTimeout(() => {
    notification.style.opacity = "1";
  }, 10);

  // Remove after 4 seconds
  setTimeout(() => {
    notification.style.opacity = "0";
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 4000);
}

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
  fetch(`${API_BASE_URL}/sendEmail`, {
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
