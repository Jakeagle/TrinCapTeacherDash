"use strict";

/**************************************SERVER LINKS**********************************/

//link to server endpoints
const teacherFindURL = "https://trinitycapitaltestserver-2.azurewebsites.net/findTeacher";
const retrieveStudentsURL = "https://trinitycapitaltestserver-2.azurewebsites.net/retrieveStudents";

/**************************************SOCKET.IO LINKS AND LISTENERS**********************************/

//Links

//Link to socket.io endpoint
export const socket = io("https://trinitycapitaltestserver-2.azurewebsites.net");

//Listeners

//turns off sign on screen when correct teacher is found.
socket.on("signOn", ([signOnSuccessful, TeacherName]) => {
  console.log("Running");
  //Checks Bool from server
  if (signOnSuccessful === true) {
    //removbes sign on screen if true
    signOnScreen.style.display = "none";
    classSelect.style.display = "block";
    teacherName = TeacherName;
  } else if (signOnSuccessful === false) {
    //Alerts invalid credentials when false
    alert("Invalid credentials. Try Again");
  }
});

socket.on("students", (students) => {
  app.style.display = "block";
  classSelect.style.display = "none";
  const studentSection = document.querySelector(".blockRow");
  students.forEach((student) => {
    const html = `<div class="col-3 studentBlock boxes">
   <div class="nameGraph row">
     <div class="col-6 name">
       <h3 class="studentName">${student.memberName}</h3>
     </div>
     <div class="col-6 chart">
       <div>
         <canvas id="myChart"></canvas>
       </div>
       <h5 class="percent">80%</h5>
     </div>
   </div>
   <hr class="sbHR" />
   <div class="lessonSubTopic row">
     <div class="col">
       <h6 class="lessonName">
         Current Lesson: ${student.currentLesson}
       </h6>
       <h6 class="subTopicName">
         Sub topic: ${student.subTopic}
       </h6>
       <h6 class="subTopicName">Activites completed: 0</h6>
     </div>
   </div>
   <hr />
   <a href="#" class="myButton">More info</a>
 </div>`;

    studentSection.insertAdjacentHTML("afterbegin", html);
  });
});

/**************************************VARIABLES**********************************/

//username section of form
const usernameInput = document.querySelector(".login__input--user");

//PIN section of form
const pinInput = document.querySelector(".login__input--pin");

//Login button
const loginBTN = document.querySelector(".login__btn");

//HTML div for the entire sign on screen
const signOnScreen = document.querySelector(".signOnSection");

//HTML for the main application
const app = document.querySelector(".app");

//HTML for period select section
const classSelect = document.querySelector(".selectPeriod");

//BTN for period selection
const periodSelectBTN = document.querySelector(".periodBTN");

//HTML select for periods
let periodsSelect = document.querySelector(".periodSelect");

//variable for the period number selected;
let periodNum;

//Variable for Teacher Name
let teacherName;

/**************************************APP CLOSE LINE**********************************/

//Immeditely hides main app until sign in and period selection
app.style.display = "none";

//Hides class select until sign on
classSelect.style.display = "none";
/**********************************EVENT LISTENERS***************************/

//Upon btn press, call function to retrieve teacher from db
loginBTN.addEventListener("click", function () {
  //Takes value for username
  const userName = usernameInput.value;
  //Takes value for PIN and makes it a num
  const pin = Number(pinInput.value);
  //Server function to find correct teacher (Takes user and PIN)
  findUser(userName, pin);
});

periodSelectBTN.addEventListener("click", function (event) {
  //num for class period selection
  retrieveStudents(periodNum, teacherName);
});

periodsSelect.addEventListener("change", function (event) {
  const selectedOption = event.target.selectedOptions[0];

  periodNum = Number(selectedOption.value);
});
/**********************************BACKEND SERVER FUNCTIONS***************************/
//Function to find correct teacher. Takes user and pin number
export async function findUser(user, pin) {
  //Awaits function under the find teacher link
  const res = await fetch(teacherFindURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      //Stringifies the user and pin variables and sends them as a parcel to the server
      parcel: [user, pin],
    }),
  });
}

export async function retrieveStudents(pNum, tName) {
  //Awaits function under the find teacher link
  const res = await fetch(retrieveStudentsURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      //Stringifies the user and pin variables and sends them as a parcel to the server
      parcel: [pNum, tName],
    }),
  });
}

/****************************************CHART.JS********************************************/

const ctx = document.getElementById("myChart").getContext("2d");
new Chart(ctx, {
  type: "doughnut",
  data: {
    labels: ["Correct", "Incorrect"],
    datasets: [
      {
        label: "Correct Answers",
        data: [19, 2],
        backgroundColor: ["#ae8626", "#7d7d7a"],
        borderWidth: 1,
      },
    ],
  },
  options: {
    plugins: {
      legend: {
        display: false, // Hides the legend
      },
      tooltip: {
        enabled: false, // Disables tooltips
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
          if (context.dataIndex === 0) {
            return percentage; // Display percentage for the correct answers
          }
          return "";
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
        display: false, // Hides the y-axis
        grid: {
          display: false, // Hides the y-axis grid lines
        },
      },
      x: {
        display: false, // Hides the x-axis
        grid: {
          display: false, // Hides the x-axis grid lines
        },
      },
    },
  },
});
