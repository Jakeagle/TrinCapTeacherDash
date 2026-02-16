# Admin Override Module (AOM) - Integration Guide

## Overview

The Admin Override Module (AOM) provides a clean system for managing lesson content inheritance from the admin account to teacher accounts.

## Key Features

- ✅ Auto-detects if teacher has their own units
- ✅ Populates admin lessons when teacher has no units
- ✅ Marks admin lessons as read-only (orange transparent overlay)
- ✅ Allows copying admin units to teacher accounts
- ✅ Fetches full lesson content from MongoDB

## File Structure

```
LCME/
└── AOM/
    ├── adminOverride.js   (Core module)
    └── README.md          (This file)
```

## Usage Example

### 1. Import the Module

```javascript
import {
  getTeacherUnitsWithOverride,
  copyAdminUnitToTeacher,
  isAdminAccount,
} from "./LCME/AOM/adminOverride.js";
```

### 2. Load Units in Lesson Modal

```javascript
// In your lesson management modal open handler
async function openLessonManagementModal(teacherName) {
  try {
    // Get units with admin override logic
    const result = await getTeacherUnitsWithOverride(teacherName);

    console.log("Units loaded:", result);
    // result = {
    //   units: [...],              // Array of unit objects with full lesson content
    //   isAdminOverride: true,     // True if showing admin lessons
    //   isReadOnly: true,          // True if teacher can't edit
    //   source: "admin@...",       // Source teacher name
    //   canCopy: true              // True if "Copy to My Units" should show
    // }

    // Display units in modal
    displayUnits(result.units, result.isReadOnly);

    // Show copy button if needed
    if (result.canCopy) {
      showCopyToMyUnitsButton(result.units);
    }
  } catch (error) {
    console.error("Failed to load units:", error);
    alert("Failed to load lessons. Please try again.");
  }
}
```

### 3. Display Units with Read-Only Styling

```javascript
function displayUnits(units, isReadOnly) {
  const container = document.getElementById("unitsContainer");
  container.innerHTML = "";

  units.forEach((unit) => {
    const unitCard = document.createElement("div");
    unitCard.className = "unit-card";

    // Add orange overlay for admin units
    if (unit.isAdminUnit || isReadOnly) {
      unitCard.classList.add("admin-unit-readonly");
      unitCard.style.position = "relative";

      // Add visual indicator
      const overlay = document.createElement("div");
      overlay.className = "admin-overlay";
      overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 165, 0, 0.1);
        border: 2px solid rgba(255, 165, 0, 0.3);
        pointer-events: none;
        border-radius: 8px;
      `;
      unitCard.appendChild(overlay);

      // Add badge
      const badge = document.createElement("span");
      badge.className = "admin-badge";
      badge.textContent = "🔒 Admin Content";
      badge.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(255, 165, 0, 0.8);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 1;
      `;
      unitCard.appendChild(badge);
    }

    // Add unit content
    unitCard.innerHTML += `
      <h5>${unit.name}</h5>
      <p>${unit.lessons?.length || 0} lessons</p>
      <ul>
        ${
          unit.lessons
            ?.map(
              (lesson) => `
          <li>${lesson.lesson_title}</li>
        `,
            )
            .join("") || ""
        }
      </ul>
    `;

    container.appendChild(unitCard);
  });
}
```

### 4. Implement "Copy to My Units" Button

```javascript
function showCopyToMyUnitsButton(units) {
  const copyBtn = document.createElement("button");
  copyBtn.className = "btn btn-primary";
  copyBtn.textContent = "📋 Copy All Units to My Account";
  copyBtn.onclick = async () => {
    if (
      !confirm(
        "Copy all admin units to your account? This will allow you to edit them.",
      )
    ) {
      return;
    }

    copyBtn.disabled = true;
    copyBtn.textContent = "⏳ Copying...";

    try {
      // Copy all units
      let successCount = 0;
      for (const unit of units) {
        const result = await copyAdminUnitToTeacher(currentTeacherName, unit);
        if (result.success) {
          successCount++;
        }
      }

      alert(`Successfully copied ${successCount} of ${units.length} units!`);

      // Reload modal with teacher's own units now
      openLessonManagementModal(currentTeacherName);
    } catch (error) {
      console.error("Copy failed:", error);
      alert("Failed to copy units. Please try again.");
    } finally {
      copyBtn.disabled = false;
      copyBtn.textContent = "📋 Copy All Units to My Account";
    }
  };

  document.getElementById("lessonModalFooter").prepend(copyBtn);
}
```

### 5. Handle Individual Unit Copy

```javascript
async function copyIndividualUnit(unit, teacherName) {
  const result = await copyAdminUnitToTeacher(teacherName, unit);

  if (result.success) {
    console.log("Unit copied:", result.copiedUnit);
    alert(`Successfully copied "${unit.name}"!`);
    // Refresh the modal
    openLessonManagementModal(teacherName);
  } else {
    alert(result.message);
  }
}
```

## API Endpoints

### GET `/api/teacher/units`

**Query Parameters:**

- `teacherName` (required): Teacher's email/name

**Response:**

```json
{
  "success": true,
  "units": [...],
  "teacherName": "teacher@example.com",
  "count": 2
}
```

### POST `/api/teacher/copy-unit`

**Body:**

```json
{
  "teacherName": "teacher@example.com",
  "unit": { "value": "unit1", "name": "Unit 1", "lessons": [...] },
  "sourceTeacher": "admin@trinity-capital.net"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Unit copied successfully",
  "unit": {...},
  "lessonsCopied": 4
}
```

## CSS Styling for Admin Units

```css
/* Admin unit read-only styling */
.unit-card.admin-unit-readonly {
  position: relative;
  opacity: 0.95;
}

.admin-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 165, 0, 0.1);
  border: 2px solid rgba(255, 165, 0, 0.3);
  pointer-events: none;
  border-radius: 8px;
  z-index: 0;
}

.admin-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(255, 165, 0, 0.8);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  z-index: 1;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* Disable edit buttons for admin units */
.admin-unit-readonly .edit-lesson-btn,
.admin-unit-readonly .delete-lesson-btn,
.admin-unit-readonly .reorder-btn {
  opacity: 0.5;
  pointer-events: none;
  cursor: not-allowed;
}
```

## Testing Checklist

- [ ] Teacher with no units sees admin lessons
- [ ] Admin lessons marked with orange overlay
- [ ] "Copy to My Units" button appears for non-admin teachers
- [ ] Copy operation creates new lessons in teacher's account
- [ ] After copying, teacher sees their own units (not admin's)
- [ ] Admin account can edit admin lessons
- [ ] Non-admin teachers cannot edit admin lessons
- [ ] Full lesson content loads correctly (content, blocks, objectives)

## Notes

- The module automatically handles different lesson ID formats (ObjectId, numeric, string)
- Copying creates new lesson documents in MongoDB (not just references)
- Original lesson IDs are preserved in `originalLessonId` field for tracking
- The system is backwards compatible with existing lesson storage formats
