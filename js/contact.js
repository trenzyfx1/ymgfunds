const sendBtn = document.getElementById('sendBtn');
const formSuccess = document.getElementById('formSuccess');

const fullName = document.getElementById('fullName');
const email = document.getElementById('email');
const subject = document.getElementById('subject');
const message = document.getElementById('message');

sendBtn.addEventListener('click', () => {
  if (!fullName.value || !email.value || !subject.value || !message.value) {
    [fullName, email, subject, message].forEach(field => {
      if (!field.value) {
        field.style.borderColor = '#e05c5c';
        field.addEventListener('input', () => {
          field.style.borderColor = '#e0e8e2';
        }, { once: true });
      }
    });
    return;
  }

  sendBtn.disabled = true;
  sendBtn.innerHTML = '<span>Sending...</span> <i class="fa-solid fa-spinner fa-spin"></i>';

  setTimeout(() => {
    sendBtn.style.display = 'none';
    formSuccess.classList.add('visible');
    fullName.value = '';
    email.value = '';
    subject.value = '';
    message.value = '';
  }, 1200);
});