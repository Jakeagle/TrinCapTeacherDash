// Inject Montserrat font
const montserratFont = document.createElement("link");
montserratFont.rel = "stylesheet";
montserratFont.href =
  "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap";
document.head.appendChild(montserratFont);

// Inject dialog-specific styles
const dialogStyle = document.createElement("style");
dialogStyle.textContent = `
  dialog#globalDialog {
    background: #3b0a70;
    color: #fff;
    border: none;
    border-radius: 20px;
    font-family: 'Montserrat', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    box-shadow: 0 4px 32px rgba(0,0,0,0.2);
    padding: 0;
    overflow: hidden;
  }
  dialog#globalDialog::backdrop {
    background: rgba(0,0,0,0.5);
  }
  #globalDialog .dialog-header {
    font-family: 'Montserrat', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-weight: 700;
    font-size: 1.3em;
    color: #fff;
    background: rgba(0,0,0,0.08);
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    text-align: center;
    justify-content: center !important;
  }
  #globalDialog .dialog-header > span {
    flex: 1;
    text-align: center;
  }
  #globalDialog .dialog-body {
    font-family: 'Montserrat', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-weight: 400;
    color: #fff;
    font-size: 1em;
    text-align: center;
  }
  #closeGlobalDialog {
    color: #fff;
    font-family: 'Montserrat', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  }
`;
document.head.appendChild(dialogStyle);

// Sign-on dialog styles
const signOnStyle = document.createElement("style");
signOnStyle.textContent = `
  dialog#signOnDialog {
    background: #3b0a70;
    color: #fff;
    border: none;
    border-radius: 20px;
    font-family: 'Montserrat', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    box-shadow: 0 4px 32px rgba(0,0,0,0.2);
    width: 400px;
    max-width: 90vw;
    padding: 0;
    overflow: hidden;
    text-align: center;
  }
  dialog#signOnDialog::backdrop {
    background: rgba(0,0,0,0.5);
  }
  #signOnDialog .dialog-header {
    font-weight: 700;
    font-size: 1.3em;
    color: #fff;
    background: rgba(0,0,0,0.08);
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    padding: 1.2em 1em 0.5em 1em;
  }
  #signOnDialog .dialog-body {
    font-weight: 400;
    color: #fff;
    font-size: 1em;
    padding: 1.2em 1.5em 1.5em 1.5em;
  }
  #signOnDialog input {
    width: 100%;
    max-width: 300px;
    margin: 0.5em 0 1em 0;
    padding: 0.7em 1em;
    border-radius: 8px;
    border: none;
    font-size: 1.1em;
    font-family: 'Montserrat', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  }
  #signOnDialog button[type="submit"] {
    width: 100%;
    max-width: 300px;
    padding: 0.7em 0;
    font-size: 1.1em;
    border-radius: 8px;
    background: #00ffcc;
    color: #3b0a70;
    font-weight: 700;
    border: none;
    cursor: pointer;
    margin-top: 0.5em;
  }
  #signOnDialog .error-message {
    color: #ffb3b3;
    margin-bottom: 0.5em;
    font-size: 1em;
    min-height: 1.5em;
  }
`;
document.head.appendChild(signOnStyle);

// Create sign-on dialog
const signOnDialog = document.createElement("dialog");
signOnDialog.id = "signOnDialog";
signOnDialog.innerHTML = `
  <div class="dialog-header">Teacher Sign On</div>
  <div class="dialog-body">
    <form id="signOnForm" autocomplete="off">
      <div class="error-message" id="signOnError"></div>
      <input type="text" id="signOnUsername" placeholder="Username" required />
      <input type="password" id="signOnPin" placeholder="PIN" required />
      <button type="submit">Sign In</button>
    </form>
  </div>
`;
document.documentElement.appendChild(signOnDialog);

// Show sign-on dialog by default
window.addEventListener("DOMContentLoaded", function () {
  if (!signOnDialog.open) signOnDialog.showModal();
});

// Helper to hash PIN using SHA-256
async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Handle sign-on form submit
signOnDialog
  .querySelector("#signOnForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();
    const username = signOnDialog.querySelector("#signOnUsername").value.trim();
    const pin = signOnDialog.querySelector("#signOnPin").value.trim();
    const errorDiv = signOnDialog.querySelector("#signOnError");
    errorDiv.textContent = "";
    if (!username || !pin) {
      errorDiv.textContent = "Please enter both username and PIN.";
      return;
    }
    console.log("Sign-in button pressed with username:", username);
    try {
      const hashedPin = await hashPin(pin);
      console.log("Calling /findTeacher API with:", {
        parcel: [username, hashedPin],
      });
      const response = await fetch("https://trinitycapitaltestserver-2.azurewebsites.net/findTeacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parcel: [username, hashedPin] }),
      });
      if (response.ok) {
        signOnDialog.close();
        window.activeTeacherUsername = username;
        // Show dashboard and navbar
        document
          .querySelector(".dashboard")
          .classList.remove("hidden-until-login");
        document
          .querySelector(".navbar")
          .classList.remove("hidden-until-login");
      } else {
        errorDiv.textContent = "Invalid username or PIN.";
      }
    } catch (err) {
      errorDiv.textContent = "Server error. Please try again.";
    }
  });

// Add event listeners to all buttons

document.addEventListener("DOMContentLoaded", function () {
  // Create dialog outside the body
  const dialog = document.createElement("dialog");
  dialog.id = "globalDialog";
  dialog.style.width = "60vw";
  dialog.style.height = "80vh";
  dialog.innerHTML = `
    <div class="dialog-header" style="display:flex;justify-content:space-between;align-items:center;padding:1em 1.2em 0 1.2em;">
      <span id="dialogTitle">Dialog</span>
      <button id="closeGlobalDialog" style="background:transparent;border:none;font-size:1.2em;cursor:pointer;">&times;</button>
    </div>
    <div class="dialog-body" style="padding:1.2em;">
      <p id="dialogContent">This is a reusable dialog.</p>
    </div>
  `;
  document.documentElement.appendChild(dialog);

  // Open dialog function
  window.openGlobalDialog = function (title, content) {
    document.getElementById("dialogTitle").textContent = title || "Dialog";
    document.getElementById("dialogContent").textContent =
      content || "This is a reusable dialog.";
    if (!dialog.open) dialog.showModal();
  };
  // Close dialog function
  window.closeGlobalDialog = function () {
    if (dialog.open) dialog.close();
  };
  // Close button event
  dialog
    .querySelector("#closeGlobalDialog")
    .addEventListener("click", function () {
      window.closeGlobalDialog();
    });

  // Sidebar buttons
  const createLessonBtn = document.querySelector(
    ".sidebar-action:nth-of-type(1)"
  );
  const sendClassMsgBtn = document.querySelector(
    ".sidebar-action:nth-of-type(2)"
  );
  const emailParentsBtn = document.querySelector(
    ".sidebar-action:nth-of-type(3)"
  );
  const accessWhirlpoolBtn = document.querySelector(
    ".sidebar-action:nth-of-type(4)"
  );

  if (createLessonBtn) {
    createLessonBtn.addEventListener("click", function () {
      window.openGlobalDialog(
        "Create Lesson",
        "This is the Create Lesson dialog."
      );
      console.log("Create Lesson button clicked");
    });
  }
  if (sendClassMsgBtn) {
    sendClassMsgBtn.addEventListener("click", function () {
      window.openGlobalDialog(
        "Send Class Message",
        "This is the Send Class Message dialog."
      );
      console.log("Send Class Message button clicked");
    });
  }
  if (emailParentsBtn) {
    emailParentsBtn.addEventListener("click", function () {
      window.openGlobalDialog(
        "Email Parents/Staff",
        "This is the Email Parents/Staff dialog."
      );
      console.log("Email Parents/Staff button clicked");
    });
  }
  if (accessWhirlpoolBtn) {
    accessWhirlpoolBtn.addEventListener("click", function () {
      window.openGlobalDialog(
        "Access Whirlpool",
        "This is the Access Whirlpool dialog."
      );
      console.log("Access Whirlpool button clicked");
    });
  }

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
              "https://trinitycapitaltestserver-2.azurewebsites.net/generateClassCodes",
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

  // Student message buttons
  const messageBtns = document.querySelectorAll(".message-btn");
  messageBtns.forEach((btn, idx) => {
    btn.addEventListener("click", function () {
      const student = btn.parentElement.querySelector("h5")?.textContent || "";
      window.openGlobalDialog(
        "Message Student",
        `Message button ${idx + 1} clicked: ${student}`
      );
      console.log(`Message button ${idx + 1} clicked: ${student}`);
    });
  });
});
