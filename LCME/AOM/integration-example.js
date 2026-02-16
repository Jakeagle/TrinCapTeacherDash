/**
 * ============================================================================
 * LESSON MANAGEMENT MODAL - INTEGRATION WITH ADMIN OVERRIDE MODULE (AOM)
 * ============================================================================
 *
 * This file shows how to integrate the Admin Override Module into your
 * existing lesson management modal in the teacher dashboard.
 *
 * Add this code to your script.js file where you handle the lesson modal.
 */

// Import the Admin Override Module
import {
  getTeacherUnitsWithOverride,
  copyAdminUnitToTeacher,
  isAdminAccount,
} from "./LCME/AOM/adminOverride.js";

// Store current teacher info
let currentTeacher = {
  name: null,
  isAdmin: false,
};

/**
 * STEP 1: Update your Lesson Management Button Click Handler
 * Replace your existing lessonManagementBtn handler with this:
 */
document
  .getElementById("lessonManagementBtn")
  ?.addEventListener("click", async function () {
    try {
      // Get current teacher name (you should already have this stored)
      const teacherName =
        currentTeacher.name || localStorage.getItem("teacherName");

      if (!teacherName) {
        alert("Please sign in first");
        return;
      }

      // Store teacher info
      currentTeacher.name = teacherName;
      currentTeacher.isAdmin = isAdminAccount(teacherName);

      // Open the modal and load units
      await openLessonManagementModal();
    } catch (error) {
      console.error("Error opening lesson management modal:", error);
      alert("Failed to open lesson management. Please try again.");
    }
  });

/**
 * STEP 2: Create the Modal Opening Function
 */
async function openLessonManagementModal() {
  // Show loading overlay
  document.getElementById("loadingOverlay")?.classList.remove("hidden");
  document.querySelector(".loading-text").textContent = "Loading lessons...";

  try {
    // Fetch units with admin override logic
    const result = await getTeacherUnitsWithOverride(currentTeacher.name);

    console.log("📚 Units loaded:", {
      count: result.units.length,
      isAdminOverride: result.isAdminOverride,
      isReadOnly: result.isReadOnly,
      source: result.source,
    });

    // Create and show modal
    const modal = createLessonManagementModal(result);
    document.body.appendChild(modal);
    modal.showModal();
  } catch (error) {
    console.error("Failed to load units:", error);
    alert("Failed to load lessons. Please check the console for details.");
  } finally {
    document.getElementById("loadingOverlay")?.classList.add("hidden");
  }
}

/**
 * STEP 3: Create the Modal with Units
 */
function createLessonManagementModal(unitsData) {
  const { units, isAdminOverride, isReadOnly, canCopy } = unitsData;

  // Create modal element
  const modal = document.createElement("dialog");
  modal.id = "lessonManagementModal";
  modal.className = "lesson-modal";
  modal.style.cssText = `
    width: 90vw;
    max-width: 1200px;
    height: 85vh;
    background: linear-gradient(135deg, #1e3a5f 0%, #2d5a7b 100%);
    border: 2px solid #00ffcc;
    border-radius: 12px;
    padding: 0;
    color: white;
  `;

  // Create modal content
  modal.innerHTML = `
    <div style="display: flex; flex-direction: column; height: 100%;">
      <!-- Header -->
      <div style="padding: 20px; border-bottom: 2px solid rgba(0, 255, 204, 0.3); display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="margin: 0; color: #00ffcc;">📚 Lesson Management</h2>
          ${
            isAdminOverride
              ? `
            <p style="margin: 5px 0 0 0; font-size: 14px; color: #ffa500;">
              🔒 Showing admin content (read-only)
            </p>
          `
              : `
            <p style="margin: 5px 0 0 0; font-size: 14px; color: rgba(255, 255, 255, 0.7);">
              Your custom units
            </p>
          `
          }
        </div>
        <button id="closeLessonModal" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 5px 10px;">
          ✕
        </button>
      </div>
      
      <!-- Body -->
      <div id="lessonModalBody" style="flex: 1; overflow-y: auto; padding: 20px;">
        ${
          units.length === 0
            ? `
          <div style="text-align: center; padding: 40px; color: rgba(255, 255, 255, 0.6);">
            <p style="font-size: 18px;">No units found</p>
            <p>Create your first unit to get started!</p>
          </div>
        `
            : ""
        }
        <div id="unitsContainer"></div>
      </div>
      
      <!-- Footer -->
      <div id="lessonModalFooter" style="padding: 20px; border-top: 2px solid rgba(0, 255, 204, 0.3); display: flex; gap: 10px; justify-content: flex-end;">
        ${
          canCopy
            ? `
          <button id="copyAllUnitsBtn" class="btn" style="background: #ffa500;">
            📋 Copy All to My Account
          </button>
        `
            : ""
        }
        <button id="createNewUnitBtn" class="btn" style="background: #00ffcc; color: #1e3a5f;" ${isReadOnly && !currentTeacher.isAdmin ? "disabled" : ""}>
          ➕ Create New Unit
        </button>
      </div>
    </div>
  `;

  // Display units
  displayUnitsInModal(units, isReadOnly);

  // Add event listeners
  modal.querySelector("#closeLessonModal").onclick = () => {
    modal.close();
    modal.remove();
  };

  if (canCopy) {
    modal.querySelector("#copyAllUnitsBtn").onclick = () =>
      handleCopyAllUnits(units);
  }

  modal.querySelector("#createNewUnitBtn")?.onclick = () => {
    if (!isReadOnly || currentTeacher.isAdmin) {
      handleCreateNewUnit();
    }
  };

  return modal;
}

/**
 * STEP 4: Display Units with Proper Styling
 */
function displayUnitsInModal(units, isReadOnly) {
  const container = document.getElementById("unitsContainer");
  if (!container) return;

  container.innerHTML = "";

  units.forEach((unit, index) => {
    const unitCard = document.createElement("div");
    unitCard.className = "unit-card";
    unitCard.style.cssText = `
      position: relative;
      background: rgba(0, 0, 0, 0.3);
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      border: 1px solid rgba(0, 255, 204, 0.2);
    `;

    // Add orange overlay for admin units
    if (unit.isAdminUnit) {
      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 165, 0, 0.1);
        border: 2px solid rgba(255, 165, 0, 0.3);
        border-radius: 8px;
        pointer-events: none;
      `;
      unitCard.appendChild(overlay);

      const badge = document.createElement("div");
      badge.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(255, 165, 0, 0.9);
        color: white;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        z-index: 1;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      `;
      badge.textContent = "🔒 Admin Content";
      unitCard.appendChild(badge);
    }

    // Unit content
    const content = document.createElement("div");
    content.style.cssText = "position: relative; z-index: 1;";
    content.innerHTML = `
      <h4 style="color: #00ffcc; margin-bottom: 10px;">${unit.name}</h4>
      <p style="color: rgba(255, 255, 255, 0.7); margin-bottom: 15px;">
        ${unit.lessons?.length || 0} lesson${unit.lessons?.length !== 1 ? "s" : ""}
      </p>
      <ul style="list-style: none; padding: 0; margin: 0;">
        ${
          unit.lessons
            ?.map(
              (lesson, i) => `
          <li style="padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
            <span style="color: white;">${i + 1}. ${lesson.lesson_title}</span>
            <span style="color: rgba(255, 255, 255, 0.5); font-size: 12px; margin-left: 10px;">
              ${lesson.lesson_description?.substring(0, 50)}${lesson.lesson_description?.length > 50 ? "..." : ""}
            </span>
          </li>
        `,
            )
            .join("") ||
          '<li style="color: rgba(255, 255, 255, 0.5);">No lessons</li>'
        }
      </ul>
      
      ${
        unit.isAdminUnit && !currentTeacher.isAdmin
          ? `
        <button class="copy-unit-btn btn" data-unit-index="${index}" style="margin-top: 15px; background: #ffa500; font-size: 14px;">
          📋 Copy This Unit to My Account
        </button>
      `
          : ""
      }
    `;

    unitCard.appendChild(content);
    container.appendChild(unitCard);
  });

  // Add click handlers for copy buttons
  container.querySelectorAll(".copy-unit-btn").forEach((btn) => {
    btn.onclick = async () => {
      const unitIndex = parseInt(btn.dataset.unitIndex);
      await handleCopyIndividualUnit(units[unitIndex]);
    };
  });
}

/**
 * STEP 5: Handle Copying Units
 */
async function handleCopyAllUnits(units) {
  const confirmed = confirm(
    `Copy all ${units.length} units to your account?\n\n` +
      "This will allow you to edit them. This action cannot be undone.",
  );

  if (!confirmed) return;

  // Show loading
  document.getElementById("loadingOverlay")?.classList.remove("hidden");
  document.querySelector(".loading-text").textContent = "Copying units...";

  try {
    let successCount = 0;
    let errorCount = 0;

    for (const unit of units) {
      try {
        const result = await copyAdminUnitToTeacher(currentTeacher.name, unit);
        if (result.success) {
          successCount++;
          console.log(`✅ Copied: ${unit.name}`);
        } else {
          errorCount++;
          console.warn(`❌ Failed: ${unit.name} - ${result.message}`);
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Error copying ${unit.name}:`, error);
      }
    }

    alert(
      `Copy complete!\n\n` +
        `✅ Successfully copied: ${successCount}\n` +
        `❌ Failed: ${errorCount}\n\n` +
        "Reloading lesson management...",
    );

    // Close and reopen modal to show teacher's own units
    document.getElementById("lessonManagementModal")?.close();
    await openLessonManagementModal();
  } catch (error) {
    console.error("Failed to copy units:", error);
    alert("An error occurred while copying units. Please try again.");
  } finally {
    document.getElementById("loadingOverlay")?.classList.add("hidden");
  }
}

async function handleCopyIndividualUnit(unit) {
  const confirmed = confirm(`Copy "${unit.name}" to your account?`);
  if (!confirmed) return;

  document.getElementById("loadingOverlay")?.classList.remove("hidden");

  try {
    const result = await copyAdminUnitToTeacher(currentTeacher.name, unit);

    if (result.success) {
      alert(`✅ Successfully copied "${unit.name}"!`);
      document.getElementById("lessonManagementModal")?.close();
      await openLessonManagementModal();
    } else {
      alert(`❌ Failed to copy unit: ${result.message}`);
    }
  } catch (error) {
    console.error("Copy failed:", error);
    alert("An error occurred. Please try again.");
  } finally {
    document.getElementById("loadingOverlay")?.classList.add("hidden");
  }
}

/**
 * STEP 6: Handle Creating New Unit (placeholder)
 */
function handleCreateNewUnit() {
  // This will be implemented in your lesson creation system
  alert("Create new unit functionality - to be implemented");
  console.log("TODO: Implement unit creation");
}

/**
 * STEP 7: Initialize on Page Load
 */
document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ Lesson Management with AOM initialized");
});

// Export for use in other modules
export { openLessonManagementModal, currentTeacher };
