// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Add scroll effect to navigation
window.addEventListener('scroll', () => {
    const nav = document.querySelector('.nav');
    if (window.scrollY > 50) {
        nav.style.background = 'rgba(3, 3, 3, 0.95)';
        nav.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.4)';
    } else {
        nav.style.background = 'rgba(3, 3, 3, 0.8)';
        nav.style.boxShadow = 'none';
    }
});

// Interactive 3D Card Hover & Tilt effect for Hero Mockup
const tiltCard = document.getElementById('tilt-card');
if (tiltCard) {
    const container = tiltCard.parentElement;
    
    container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left; // x coordinate within client
        const y = e.clientY - rect.top;  // y coordinate within client
        
        // Calculate percentages
        const px = x / rect.width;
        const py = y / rect.height;
        
        // Calculate tilt angles (-15deg to 15deg)
        const tiltX = (py - 0.5) * -20;
        const tiltY = (px - 0.5) * 20;
        
        // Apply transform to the card
        tiltCard.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
    });
    
    container.addEventListener('mouseleave', () => {
        // Smoothly return to center
        tiltCard.style.transition = 'transform 0.5s ease-out';
        tiltCard.style.transform = 'rotateX(0deg) rotateY(0deg)';
    });
    
    container.addEventListener('mouseenter', () => {
        tiltCard.style.transition = 'transform 0.1s ease-out';
    });
}

// Scroll Entrance Animations (Fade-in-up)
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Select sections to animate
document.querySelectorAll('.feature-card, .step-card, .video-wrapper').forEach(elem => {
    elem.style.opacity = '0';
    elem.style.transform = 'translateY(30px)';
    elem.style.transition = 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
    observer.observe(elem);
});
