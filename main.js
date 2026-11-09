/* ============================================
   UNSEPTZEROTROIS PORTFOLIO â€” ANIMATIONS V2
   ============================================ */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from '@studio-freight/lenis';

gsap.registerPlugin(ScrollTrigger);

// ============================================
// LENIS SMOOTH SCROLL
// ============================================

const lenis = new Lenis({
    duration: 1.4,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: 'vertical',
    smoothWheel: true,
});

// Expose globally for gesture control
window.lenis = lenis;

function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

// Smooth anchor links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(anchor.getAttribute('href'));
        if (target) lenis.scrollTo(target, { offset: -80, duration: 1.5 });
        closeMobileNav();
    });
});

// ============================================
// CUSTOM CURSOR
// ============================================

const cursorDot = document.getElementById('cursorDot');
const cursorOutline = document.getElementById('cursorOutline');
let mouseX = 0, mouseY = 0;
let outlineX = 0, outlineY = 0;

if (window.innerWidth > 768) {
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        gsap.to(cursorDot, { x: mouseX, y: mouseY, duration: 0.08 });
    });

    function animateCursor() {
        outlineX += (mouseX - outlineX) * 0.1;
        outlineY += (mouseY - outlineY) * 0.1;
        cursorOutline.style.left = outlineX + 'px';
        cursorOutline.style.top = outlineY + 'px';
        requestAnimationFrame(animateCursor);
    }
    animateCursor();

    const hoverTargets = document.querySelectorAll(
        'a, button, .magnetic-btn, .nav-link, .pill, .project-stack span, .project-img-main, .bento-card, .skill-card, .tool-item'
    );

    hoverTargets.forEach((el) => {
        el.addEventListener('mouseenter', () => {
            cursorDot.classList.add('hovering');
            cursorOutline.classList.add('hovering');
        });
        el.addEventListener('mouseleave', () => {
            cursorDot.classList.remove('hovering');
            cursorOutline.classList.remove('hovering');
        });
    });
}

// ============================================
// MAGNETIC BUTTONS (SUBTLE)
// ============================================

if (window.innerWidth > 768) {
    document.querySelectorAll('.magnetic-btn').forEach((btn) => {
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            gsap.to(btn, {
                x: x * 0.15,
                y: y * 0.15,
                duration: 0.3,
                ease: 'power2.out',
            });
        });

        btn.addEventListener('mouseleave', () => {
            gsap.to(btn, {
                x: 0, y: 0,
                duration: 0.5,
                ease: 'elastic.out(1, 0.4)',
            });
        });
    });
}

// ============================================
// PRELOADER
// ============================================

const preloaderEl = document.querySelector('.preloader');
if (preloaderEl) {
    const preloaderTl = gsap.timeline();
    preloaderTl
        .to('.preloader-shape', {
            opacity: 1, stagger: 0.12, duration: 0.4, ease: 'power2.out',
        })
        .to('.preloader-name', { opacity: 1, duration: 0.5, ease: 'power2.out' }, '-=0.2')
        .to('.preloader-bar', { opacity: 1, duration: 0.25 }, '-=0.2')
        .to('#preloaderBar', { width: '100%', duration: 1, ease: 'power2.inOut' })
        .to('.preloader', {
            yPercent: -100,
            duration: 0.7,
            ease: 'power4.inOut',
            onComplete: () => {
                preloaderEl.style.display = 'none';
                startHeroAnimations();
            },
        }, '+=0.15');
} else {
    // If no preloader, check if hero exists to run its animation
    if (document.querySelector('.hero')) {
        setTimeout(startHeroAnimations, 100);
    }
}

// ============================================
// HERO ANIMATIONS
// ============================================

function startHeroAnimations() {
    const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });

    tl
        .to('.navbar', { opacity: 1, duration: 0.7 })
        .to('.hero-badge', { opacity: 1, y: 0, duration: 0.6 }, '-=0.3')
        .to('.line-1 .reveal-text', { y: 0, opacity: 1, duration: 1.1 }, '-=0.3')
        .to('.line-2 .reveal-text', { y: 0, opacity: 1, duration: 1.1 }, '-=0.8')
        .to('.line-3 .reveal-text', { y: 0, opacity: 1, duration: 0.9 }, '-=0.5')
        .to('.line-4 .reveal-text', { y: 0, opacity: 1, duration: 0.9 }, '-=0.7')
        .to('.hero-cta', { opacity: 1, y: 0, duration: 0.7 }, '-=0.4')
        .to('.scroll-indicator', { opacity: 1, duration: 0.5 }, '-=0.2');
}

// ============================================
// SCROLL TRIGGERS
// ============================================

// Navbar scroll state
const heroSection = document.querySelector('.hero');
if (heroSection) {
    ScrollTrigger.create({
        trigger: '.hero',
        start: 'bottom top',
        onEnter: () => document.querySelector('.navbar').classList.add('scrolled'),
        onLeaveBack: () => document.querySelector('.navbar').classList.remove('scrolled'),
    });
} else {
    document.querySelector('.navbar').classList.add('scrolled'); // Default for inner pages
}

// Active nav highlight
document.querySelectorAll('section[id]').forEach((section) => {
    ScrollTrigger.create({
        trigger: section,
        start: 'top center',
        end: 'bottom center',
        onEnter: () => updateActiveNav(section.id),
        onEnterBack: () => updateActiveNav(section.id),
    });
});

function updateActiveNav(id) {
    document.querySelectorAll('.nav-link').forEach((link) => {
        link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
    });
}

// Section title reveals
gsap.utils.toArray('.section-title-large .reveal-text').forEach((text) => {
    gsap.to(text, {
        y: 0, opacity: 1, duration: 1, ease: 'power4.out',
        scrollTrigger: {
            trigger: text.closest('.section-header'),
            start: 'top 82%',
            toggleActions: 'play none none none',
        },
    });
});

// Section labels
gsap.utils.toArray('.section-label').forEach((label) => {
    gsap.fromTo(label, { opacity: 0, x: -20 }, {
        opacity: 1, x: 0, duration: 0.6,
        scrollTrigger: {
            trigger: label,
            start: 'top 85%',
            toggleActions: 'play none none none',
        },
    });
});

// Card reveals
gsap.utils.toArray('.card-reveal').forEach((card, i) => {
    gsap.to(card, {
        opacity: 1, y: 0,
        duration: 0.7,
        delay: (i % 4) * 0.08,
        ease: 'power3.out',
        scrollTrigger: {
            trigger: card,
            start: 'top 87%',
            toggleActions: 'play none none none',
        },
    });
});

// Tool logo stagger reveals
gsap.utils.toArray('.tool-reveal').forEach((tool, i) => {
    gsap.to(tool, {
        opacity: 1, y: 0,
        duration: 0.6,
        delay: i * 0.06,
        ease: 'power3.out',
        scrollTrigger: {
            trigger: '.tools-grid',
            start: 'top 82%',
            toggleActions: 'play none none none',
        },
    });
});

// Stat counter animation
gsap.utils.toArray('.stat-number-big').forEach((stat) => {
    const target = parseInt(stat.dataset.count);
    const obj = { val: 0 };
    gsap.to(obj, {
        val: target,
        duration: 2,
        ease: 'power2.out',
        scrollTrigger: {
            trigger: stat,
            start: 'top 85%',
            toggleActions: 'play none none none',
        },
        onUpdate: () => {
            stat.textContent = Math.round(obj.val);
        },
    });
});

// Project block animations
document.querySelectorAll('.project-block').forEach((block) => {
    const visual = block.querySelector('.project-visual');
    const details = block.querySelector('.project-details');

    const tl = gsap.timeline({
        scrollTrigger: {
            trigger: block,
            start: 'top 75%',
            toggleActions: 'play none none none',
        },
    });

    tl.to(visual, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' })
        .to(details, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' }, '-=0.6');

    // Parallax on visual
    gsap.to(visual, {
        y: -30,
        scrollTrigger: {
            trigger: block,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1.5,
        },
    });
});


// Hide scroll indicator
ScrollTrigger.create({
    trigger: '.hero',
    start: 'top top',
    end: '25% top',
    onLeave: () => gsap.to('.scroll-indicator', { opacity: 0, duration: 0.3 }),
    onEnterBack: () => gsap.to('.scroll-indicator', { opacity: 1, duration: 0.3 }),
});

// ============================================
// SUBTLE CARD TILT
// ============================================

if (window.innerWidth > 768) {
    document.querySelectorAll('.bento-card, .skill-category').forEach((card) => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -1.5;
            const rotateY = ((x - centerX) / centerX) * 1.5;

            gsap.to(card, {
                rotateX, rotateY,
                duration: 0.3,
                ease: 'power2.out',
                transformPerspective: 1000,
            });

            // Move glow to cursor position
            const glow = card.querySelector('.bento-card-glow');
            if (glow) {
                gsap.to(glow, {
                    x: x - rect.width,
                    y: y - rect.height,
                    duration: 0.3,
                });
            }
        });

        card.addEventListener('mouseleave', () => {
            gsap.to(card, {
                rotateX: 0, rotateY: 0,
                duration: 0.5,
                ease: 'elastic.out(1, 0.6)',
            });
        });
    });
}

// ============================================
// MOBILE NAV
// ============================================

const navMenuBtn = document.getElementById('navMenuBtn');
const mobileNav = document.getElementById('mobileNav');

function closeMobileNav() {
    navMenuBtn.classList.remove('active');
    mobileNav.classList.remove('open');
    lenis.start();
}

navMenuBtn.addEventListener('click', () => {
    const isOpen = mobileNav.classList.contains('open');
    if (isOpen) {
        closeMobileNav();
    } else {
        navMenuBtn.classList.add('active');
        mobileNav.classList.add('open');
        lenis.stop();
    }
});

document.querySelectorAll('.mobile-nav-link').forEach((link) => {
    link.addEventListener('click', closeMobileNav);
});

// ============================================
// UTILITIES
// ============================================

let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => ScrollTrigger.refresh(), 250);
});

document.addEventListener('visibilitychange', () => {
    document.hidden ? lenis.stop() : lenis.start();
});

// ============================================
// GALLERY FILTERING
// ============================================

const filterBtns = document.querySelectorAll('.filter-btn');
const galleryItems = document.querySelectorAll('.gallery-item');

if (filterBtns.length > 0 && galleryItems.length > 0) {
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filterValue = btn.getAttribute('data-filter');

            // Filter elements with animation
            galleryItems.forEach(item => {
                const category = item.getAttribute('data-category');

                if (filterValue === 'all' || filterValue === category) {
                    item.classList.remove('hide');
                    gsap.fromTo(item,
                        { opacity: 0, scale: 0.95 },
                        { opacity: 1, scale: 1, duration: 0.4, ease: 'power2.out' }
                    );
                } else {
                    item.classList.add('hide');
                }
            });

            // Refresh scroll trigger after layout update
            setTimeout(() => {
                ScrollTrigger.refresh();
            }, 100);
        });
    });
}

// ============================================
// GALLERY LIGHTBOX & REACTIONS
// ============================================

const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxClose = document.getElementById('lightboxClose');
const lightboxPrev = document.getElementById('lightboxPrev');
const lightboxNext = document.getElementById('lightboxNext');
const lightboxContent = document.querySelector('.lightbox-content');
const reactionBtns = document.querySelectorAll('.reaction-btn');

let currentGalleryArray = [];
let currentGalleryIndex = 0;

if (lightbox && lightboxImg && lightboxClose) {

    // Helper to update lightbox image and buttons states
    const updateLightboxView = () => {
        if (currentGalleryArray.length > 0) {
            lightboxImg.src = currentGalleryArray[currentGalleryIndex];

            // Toggle Prev Arrow
            if (currentGalleryIndex === 0) {
                lightboxPrev.disabled = true;
            } else {
                lightboxPrev.disabled = false;
            }

            // Toggle Next Arrow
            if (currentGalleryIndex === currentGalleryArray.length - 1) {
                lightboxNext.disabled = true;
            } else {
                lightboxNext.disabled = false;
            }
        }

        // Remove zoom on change
        lightboxImg.classList.remove('zoomed');
        lightboxContent.classList.remove('scrollable');

        // Reset reactions on new image view
        reactionBtns.forEach(btn => {
            btn.classList.remove('active');
            const countSpan = btn.querySelector('.count');
            countSpan.textContent = '0'; // Demo reset
        });
    };

    // Open Lightbox
    galleryItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            const galleryData = item.getAttribute('data-gallery');

            if (galleryData) {
                // Parse the array
                currentGalleryArray = JSON.parse(galleryData);
                currentGalleryIndex = 0;
            } else {
                // Fallback to single image
                const img = item.querySelector('img');
                if (img) {
                    currentGalleryArray = [img.src];
                    currentGalleryIndex = 0;
                }
            }

            if (currentGalleryArray.length > 0) {
                // Temporarily disable smooth scroll
                lenis.stop();

                updateLightboxView();

                // Hide arrows if only 1 image
                if (currentGalleryArray.length <= 1) {
                    if (lightboxPrev) lightboxPrev.style.display = 'none';
                    if (lightboxNext) lightboxNext.style.display = 'none';
                } else {
                    if (lightboxPrev) lightboxPrev.style.display = '';
                    if (lightboxNext) lightboxNext.style.display = '';
                }

                lightbox.classList.add('active');
            }
        });
    });

    // Navigation Logic
    if (lightboxPrev) {
        lightboxPrev.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent clicking background
            if (currentGalleryIndex > 0) {
                currentGalleryIndex--;
                updateLightboxView();
            }
        });
    }

    if (lightboxNext) {
        lightboxNext.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent clicking background
            if (currentGalleryIndex < currentGalleryArray.length - 1) {
                currentGalleryIndex++;
                updateLightboxView();
            }
        });
    }

    // Close Lightbox
    const closeLightbox = () => {
        lightbox.classList.remove('active');
        lightboxImg.classList.remove('zoomed');
        lightboxContent.classList.remove('scrollable');
        lenis.start();
    };

    lightboxClose.addEventListener('click', closeLightbox);

    // Close on background click
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox || e.target === lightboxContent) {
            closeLightbox();
        }
    });

    // Keyboard support (Escape, Arrows)
    document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;

        if (e.key === 'Escape') {
            closeLightbox();
        } else if (e.key === 'ArrowLeft' && lightboxPrev && !lightboxPrev.disabled) {
            currentGalleryIndex--;
            updateLightboxView();
        } else if (e.key === 'ArrowRight' && lightboxNext && !lightboxNext.disabled) {
            currentGalleryIndex++;
            updateLightboxView();
        }
    });

    // Zoom Toggle (Scrollable)
    lightboxImg.addEventListener('click', (e) => {
        e.stopPropagation();
        lightboxImg.classList.toggle('zoomed');
        if (lightboxImg.classList.contains('zoomed')) {
            lightboxContent.classList.add('scrollable');
        } else {
            lightboxContent.classList.remove('scrollable');
        }
    });

    // Default open on load via query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project');

    if (projectId) {
        // Find the first image belonging to this project and click it
        const targetImage = Array.from(galleryItems).find(
            item => item.getAttribute('data-project') === projectId
        );

        if (targetImage) {
            // Trigger a click to open lightbox right away 
            // after animations initialize
            setTimeout(() => {
                targetImage.click();
            }, 600);
        }
    }

    // Reaction Buttons Logic (Mutually exclusive reactions)
    reactionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const countSpan = btn.querySelector('.count');
            let currentCount = parseInt(countSpan.textContent);

            if (btn.classList.contains('active')) {
                // Remove reaction if already click on the same active button
                btn.classList.remove('active');
                countSpan.textContent = currentCount - 1;
            } else {
                // First, find if there is another already active button 
                // and deactivate it (subtract its count)
                const alreadyActiveBtn = Array.from(reactionBtns).find(b => b.classList.contains('active'));

                if (alreadyActiveBtn) {
                    alreadyActiveBtn.classList.remove('active');
                    const activeCountSpan = alreadyActiveBtn.querySelector('.count');
                    activeCountSpan.textContent = parseInt(activeCountSpan.textContent) - 1;
                }

                // Now activate the clicked button
                btn.classList.add('active');
                countSpan.textContent = currentCount + 1;

                // Small pop animation
                gsap.fromTo(btn,
                    { scale: 1.2 },
                    { scale: 1, duration: 0.3, ease: "back.out(2)" }
                );
            }
        });
    });
}

// ============================================
// SIMPLE TITLE ANIMATIONS (NO SCATTER)
// ============================================

// Ensure reveal-text stays in final position after animation
setTimeout(() => {
    const revealTexts = document.querySelectorAll('.reveal-text');
    revealTexts.forEach(rt => {
        gsap.set(rt, { y: 0, clearProps: "transform" });
        rt.style.transform = 'none';
    });
}, 3000);
