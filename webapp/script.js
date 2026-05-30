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

// Interactive 3D Card Hover & Tilt for Credit Card styled Token Card
const ccCard = document.getElementById('cc-card');
if (ccCard) {
    const wrap = ccCard.parentElement;
    const glow = ccCard.querySelector('.cc-glow');
    
    wrap.addEventListener('mousemove', (e) => {
        const rect = wrap.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const px = x / rect.width;
        const py = y / rect.height;
        
        const tiltX = (py - 0.5) * -25;
        const tiltY = (px - 0.5) * 25;
        
        ccCard.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
        
        // Dynamic glow movement
        if (glow) {
            glow.style.top = `${y - rect.height}px`;
            glow.style.left = `${x - rect.width}px`;
        }
    });
    
    wrap.addEventListener('mouseleave', () => {
        ccCard.style.transition = 'transform 0.6s ease-out';
        ccCard.style.transform = 'rotateX(0deg) rotateY(0deg)';
        if (glow) {
            glow.style.top = '-50%';
            glow.style.left = '-50%';
        }
    });
    
    wrap.addEventListener('mouseenter', () => {
        ccCard.style.transition = 'transform 0.15s ease-out';
    });
}

// Copy Coin Address to Clipboard
const copyBtn = document.getElementById('btn-copy-address');
if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
        const address = copyBtn.getAttribute('data-address');
        const copyText = copyBtn.querySelector('.copy-text');
        const copyIcon = copyBtn.querySelector('i');
        
        try {
            await navigator.clipboard.writeText(address);
            
            // Visual success feedback
            copyText.textContent = 'Copied!';
            copyIcon.className = 'fas fa-check';
            copyBtn.style.background = '#00c853';
            copyBtn.style.color = '#fff';
            
            setTimeout(() => {
                copyText.textContent = 'Copy Address';
                copyIcon.className = 'fas fa-copy';
                copyBtn.style.background = '';
                copyBtn.style.color = '';
            }, 2000);
        } catch (err) {
            console.error('Failed to copy wallet address:', err);
        }
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
document.querySelectorAll('.feature-card, .step-card, .video-wrapper, .cc-card').forEach(elem => {
    elem.style.opacity = '0';
    elem.style.transform = 'translateY(30px)';
    elem.style.transition = 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
    observer.observe(elem);
});
