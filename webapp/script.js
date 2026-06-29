// ── Dynamic Download Section ─────────────────────────────────────────────────
// Fetches the latest GitHub release and builds platform-grouped download cards
// so the page always reflects the newest version without manual HTML edits.

(function initDownloadSection() {
    const REPO = 'TechyCSR/OpenCluely';
    const API  = `https://api.github.com/repos/${REPO}/releases/latest`;

    const el = (id) => document.getElementById(id);

    // Platform definitions: label, icon class, note text, and a function that
    // tests whether a filename belongs to this platform.
    const PLATFORMS = [
        {
            id: 'windows',
            label: 'Windows',
            icon: 'fa-brands fa-windows',
            note: 'NSIS installer — no extra tools needed',
            match: (n) => n.endsWith('.exe') && !n.includes('blockmap') && !n.includes('portable'),
        },
        {
            id: 'macos-arm',
            label: 'macOS (Apple Silicon)',
            icon: 'fa-brands fa-apple',
            note: 'M1 / M2 / M3 / M4 — arm64 DMG',
            match: (n) => n.endsWith('.dmg') && n.includes('arm64'),
        },
        {
            id: 'macos-intel',
            label: 'macOS (Intel)',
            icon: 'fa-brands fa-apple',
            note: 'Older Intel Macs — x64 DMG',
            match: (n) => n.endsWith('.dmg') && !n.includes('arm64'),
        },
        {
            id: 'linux-deb',
            label: 'Linux (Debian / Ubuntu)',
            icon: 'fa-brands fa-linux',
            note: 'Auto-installs Python, ffmpeg & GTK',
            match: (n) => n.endsWith('.deb'),
        },
        {
            id: 'linux-appimage',
            label: 'Linux (Universal)',
            icon: 'fa-brands fa-linux',
            note: 'No install — chmod +x then run',
            match: (n) => n.endsWith('.AppImage'),
        },
    ];

    function fmtBytes(bytes) {
        if (!bytes) return '';
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    function fmtDate(iso) {
        return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function buildCard(platform, assets) {
        const links = assets.map(a => `
            <a class="dl-btn" href="${a.browser_download_url}" target="_blank" rel="noopener">
                <i class="fas fa-arrow-down"></i>
                <span>${a.name}</span>
                <span class="file-size">${fmtBytes(a.size)}</span>
            </a>`).join('');

        return `
        <div class="platform-card">
            <div class="platform-icon"><i class="${platform.icon}"></i></div>
            <h4>${platform.label}</h4>
            <p class="platform-note">${platform.note}</p>
            <div class="download-links">${links || '<span style="color:var(--text-muted);font-size:.82rem">No asset in this release</span>'}</div>
        </div>`;
    }

    function render(release) {
        // Skip meta assets (checksums, yml updater files, blockmaps)
        const assets = (release.assets || []).filter(a =>
            !a.name.endsWith('.blockmap') &&
            !a.name.endsWith('.yml') &&
            a.name !== 'SHA256SUMS.txt'
        );

        // Version banner
        const versionEl = el('download-version');
        versionEl.innerHTML = `
            <span class="release-tag">
                <i class="fas fa-tag"></i> ${release.tag_name}
                <span class="release-date">released ${fmtDate(release.published_at)}</span>
            </span>`;

        // Platform cards
        const gridEl = el('download-grid');
        gridEl.innerHTML = PLATFORMS.map(p => {
            const matched = assets.filter(a => p.match(a.name.toLowerCase()));
            return buildCard(p, matched);
        }).join('');

        // Show everything, hide loading
        el('download-loading').classList.add('hidden');
        versionEl.classList.remove('hidden');
        gridEl.classList.remove('hidden');
        el('download-footer').classList.remove('hidden');
    }

    function showError() {
        el('download-loading').classList.add('hidden');
        el('download-error').classList.remove('hidden');
    }

    fetch(API, { headers: { Accept: 'application/vnd.github+json' } })
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(render)
        .catch(showError);
})();

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
