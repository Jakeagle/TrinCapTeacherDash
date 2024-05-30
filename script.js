"use strict";

/**************************************SERVER LINKS**********************************/

//link to server endpoint
const teacherFindURL = "http://localhost:3000/findTeacher";

/**************************************SOCKET.IO LINKS AND LISTENERS**********************************/

//Links

//Link to socket.io endpoint
export const socket = io("http://localhost:3000");

//Listeners

//turns off sign on screen when correct teacher is found.
socket.on("signOn", (signOnSuccessful) => {
  console.log("Running");
  //Checks Bool from server
  if (signOnSuccessful === true) {
    //removbes sign on screen if true
    signOnScreen.style.display = "none";
  } else if (signOnSuccessful === false) {
    //Alerts invalid credentials when false
    alert("Invalid credentials. Try Again");
  }
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
