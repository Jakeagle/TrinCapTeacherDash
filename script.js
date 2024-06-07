"use strict";

/**************************************SERVER LINKS**********************************/

// link to server endpoints
const teacherFindURL = "http://localhost:3000/findTeacher";
const retrieveStudentsURL = "http://localhost:3000/retrieveStudents";
const studentInfoURL = "http://localhost:3000/studentInfo";

/**************************************SOCKET.IO LINKS AND LISTENERS**********************************/

// Link to socket.io endpoint
export const socket = io("http://localhost:3000");

// Listeners
socket.on("signOn", ([signOnSuccessful, TeacherName]) => {
  console.log("Running");
  if (signOnSuccessful === true) {
    signOnScreen.style.display = "none";
    classSelect.style.display = "block";
    teacherName = TeacherName;
  } else if (signOnSuccessful === false) {
    alert("Invalid credentials. Try Again");
  }
});

socket.on("students", (students) => {
  app.style.display = "block";
  classSelect.style.display = "none";
  const studentSection = document.querySelector(".blockRow");

  students.forEach((student, index) => {
    const canvasId = `myChart-${index}`;
    const html = `
      <div class="col-3 studentBlock boxes">
        <div class="nameGraph row">
          <div class="col-6 name">
            <h3 class="studentName">${student.memberName}</h3>
          </div>
          <div class="col-6 chart">
            <div>
              <canvas id="${canvasId}"></canvas>
              <h5 class="percent">80%</h5>
            </div>
          </div>
        </div>
        <hr class="sbHR" />
        <div class="lessonSubTopic row">
          <div class="col">
            <h6 class="lessonName">Current Lesson: ${student.currentLesson}</h6>
            <h6 class="subTopicName">Sub topic: ${student.subTopic}</h6>
            <h6 class="subTopicName">Activities completed: 0</h6>
          </div>
        </div>
        <hr />
        <a href="#" class="myButton">More info</a>
      </div>`;
    studentSection.insertAdjacentHTML("afterbegin", html);

    const ctx = document.getElementById(canvasId).getContext("2d");
    if (ctx) {
      new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: ["Correct", "Incorrect"],
          datasets: [
            {
              label: "Correct Answers",
              data: [19, 2],
              backgroundColor: ["#ae8626", "#7d7d7a"],
              borderWidth: 0.1,
            },
          ],
        },
        options: {
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              enabled: false,
            },
            datalabels: {
              display: true,
              align: "center",
              formatter: (value, context) => {
                const total = context.chart.data.datasets[0].data.reduce(
                  (a, b) => a + b,
                  0
                );
                const percentage = ((value / total) * 100).toFixed(2) + "%";
                return context.dataIndex === 0 ? percentage : "";
              },
              color: "black",
              font: {
                weight: "bold",
                size: "1",
              },
            },
          },
          scales: {
            y: {
              display: false,
              grid: {
                display: false,
              },
            },
            x: {
              display: false,
              grid: {
                display: false,
              },
            },
          },
        },
      });
    }
  });

  console.log("Charts initialized");
  addMoreInfoListeners();
});

/**************************************VARIABLES**********************************/

// username section of form
const usernameInput = document.querySelector(".login__input--user");

// PIN section of form
const pinInput = document.querySelector(".login__input--pin");

// Login button
const loginBTN = document.querySelector(".login__btn");

// HTML div for the entire sign on screen
const signOnScreen = document.querySelector(".signOnSection");

// HTML for the main application
const app = document.querySelector(".app");

// HTML for period select section
const classSelect = document.querySelector(".selectPeriod");

// BTN for period selection
const periodSelectBTN = document.querySelector(".periodBTN");

// HTML select for periods
let periodsSelect = document.querySelector(".periodSelect");

// variable for the period number selected
let periodNum;

// Variable for Teacher Name
let teacherName;

let ctx;

/**************************************APP CLOSE LINE**********************************/

// Immediately hides main app until sign in and period selection
app.style.display = "none";

// Hides class select until sign on
classSelect.style.display = "none";

/**********************************EVENT LISTENERS***************************/

// Upon btn press, call function to retrieve teacher from db
loginBTN.addEventListener("click", handleLogin);

periodSelectBTN.addEventListener("click", handlePeriodSelection);

periodsSelect.addEventListener("change", handlePeriodChange);

/**********************************MORE INFO BUTTON CODE***************************/

// Add event listeners to all "More Info" buttons
function addMoreInfoListeners() {
  document.querySelectorAll(".myButton").forEach((button) => {
    button.addEventListener("click", handleMoreInfo);
  });
}

/**********************************BACKEND SERVER FUNCTIONS***************************/

// Function to find correct teacher. Takes user and pin number
export async function findUser(user, pin) {
  const res = await fetch(teacherFindURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parcel: [user, pin],
    }),
  });
}

export async function retrieveStudents(pNum, tName) {
  const res = await fetch(retrieveStudentsURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parcel: [pNum, tName],
    }),
  });
}

/**********************************FUNCTIONS***************************/

// Function to handle login button click
function handleLogin() {
  const userName = usernameInput.value;
  const pin = Number(pinInput.value);
  findUser(userName, pin);
}

// Function to handle period selection button click
function handlePeriodSelection(event) {
  retrieveStudents(periodNum, teacherName);
}

// Function to handle period selection change
function handlePeriodChange(event) {
  const selectedOption = event.target.selectedOptions[0];
  periodNum = Number(selectedOption.value);
}

// Function to handle "More Info" button click
function handleMoreInfo(event) {
  event.preventDefault();
  const button = event.currentTarget;
  const studentBlock = button.closest(".studentBlock");
  const studentName = studentBlock.querySelector(".studentName").textContent;

  fetchStudentInfo(studentName)
    .then((studentInfo) => {
      console.log(studentInfo);
    })
    .catch((error) => {
      console.error("Error fetching student information:", error);
    });
}

// Function to fetch additional information for a student
async function fetchStudentInfo(studentName) {
  console.log(studentName, teacherName);
  try {
    const response = await fetch(studentInfoURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parcel: [studentName, teacherName],
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch student information");
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}
