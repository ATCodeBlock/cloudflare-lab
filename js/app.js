'use strict';

function showComingSoon(name) {
  const toast = document.getElementById('toast');
  toast.textContent = `🚧 ${name} is coming soon. Stay tuned!`;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

(function () {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('nav a[href^="#"]');

  function onScroll() {
    let current = '';
    sections.forEach(sec => {
      if (window.scrollY >= sec.offsetTop - 80) current = sec.id;
    });
    navLinks.forEach(link => {
      link.style.color = link.getAttribute('href') === `#${current}`
        ? 'var(--orange)'
        : '';
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
})();