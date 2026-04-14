signInWithEmailAndPassword(auth, email, password)
  .then((userCredential) => {
    window.location.href = "../dashboard.html";
  })
  .catch((error) => {
    alert("Invalid login details");
  });