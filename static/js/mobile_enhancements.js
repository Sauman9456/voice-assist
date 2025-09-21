/**
 * Mobile UI Enhancements
 * Improves the mobile experience for the Voice Assistant app
 */

document.addEventListener('DOMContentLoaded', function() {
    // Check if device is mobile
    const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    
    // Set CSS custom property for viewport height
    function setViewportHeight() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    
    // Create mobile-specific UI elements
    function createMobileUI() {
        if (!isMobile()) return;
        
        // Create mobile animation panel
        const mobilePanel = document.createElement('div');
        mobilePanel.className = 'mobile-animation-panel';
        mobilePanel.innerHTML = `
            <div class="mobile-animation-content">
                <button class="mobile-animation-toggle" aria-label="Close animation panel">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
                <div class="mobile-animation">
                    <div class="mobile-idle-animation">
                        <div class="mini-orbit"></div>
                        <div class="mini-core"></div>
                    </div>
                </div>
                <div class="mobile-status">Ready</div>
            </div>
        `;
        document.body.appendChild(mobilePanel);
        
        // Create toggle button in header
        const header = document.querySelector('.chat-header');
        if (header) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'mobile-animation-toggle';
            toggleBtn.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M12 1v6"></path>
                    <path d="M12 17v6"></path>
                    <path d="M4.22 4.22l4.24 4.24"></path>
                    <path d="M15.54 15.54l4.24 4.24"></path>
                    <path d="M21 12h-6"></path>
                    <path d="M3 12h6"></path>
                    <path d="M19.78 4.22l-4.24 4.24"></path>
                    <path d="M8.46 15.54l-4.24 4.24"></path>
                </svg>
            `;
            toggleBtn.setAttribute('aria-label', 'Show animation panel');
            header.insertBefore(toggleBtn, header.firstChild);
            
            // Add click handlers
            toggleBtn.addEventListener('click', showMobilePanel);
            const closeBtn = mobilePanel.querySelector('.mobile-animation-toggle');
            closeBtn.addEventListener('click', hideMobilePanel);
        }
    }
    
    // Show mobile animation panel
    function showMobilePanel() {
        const panel = document.querySelector('.mobile-animation-panel');
        if (panel) {
            panel.classList.add('show');
        }
    }
    
    // Hide mobile animation panel
    function hideMobilePanel() {
        const panel = document.querySelector('.mobile-animation-panel');
        if (panel) {
            panel.classList.remove('show');
        }
    }
    
    // Update mobile animation state
    function updateMobileAnimation(state) {
        const mobileStatus = document.querySelector('.mobile-status');
        const mobileAnimation = document.querySelector('.mobile-animation');
        
        if (!mobileStatus || !mobileAnimation) return;
        
        // Clear existing animation
        mobileAnimation.innerHTML = '';
        
        switch(state) {
            case 'idle':
                mobileStatus.textContent = 'Ready';
                mobileAnimation.innerHTML = `
                    <div class="mobile-idle-animation">
                        <div class="mini-orbit"></div>
                        <div class="mini-core"></div>
                    </div>
                `;
                break;
            case 'user-speaking':
                mobileStatus.textContent = 'Listening...';
                mobileAnimation.innerHTML = `
                    <div class="mobile-sound-waves">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                `;
                break;
            case 'ai-speaking':
                mobileStatus.textContent = 'Speaking...';
                mobileAnimation.innerHTML = `
                    <div class="mobile-ai-pulse">
                        <div class="pulse-dot"></div>
                    </div>
                `;
                break;
            case 'processing':
                mobileStatus.textContent = 'Processing...';
                mobileAnimation.innerHTML = `
                    <div class="mobile-processing">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                `;
                break;
        }
    }
    
    // Handle orientation changes
    function handleOrientationChange() {
        setViewportHeight();
        
        // Re-check if mobile and update UI
        if (isMobile()) {
            if (!document.querySelector('.mobile-animation-panel')) {
                createMobileUI();
            }
        } else {
            // Remove mobile UI on desktop
            const mobilePanel = document.querySelector('.mobile-animation-panel');
            const toggleBtn = document.querySelector('.chat-header .mobile-animation-toggle');
            if (mobilePanel) mobilePanel.remove();
            if (toggleBtn) toggleBtn.remove();
        }
    }
    
    // Improve touch interactions
    function enhanceTouchInteractions() {
        if (!isTouchDevice) return;
        
        // Add touch feedback to buttons
        const buttons = document.querySelectorAll('.btn-control, .btn-logout, .btn-primary');
        buttons.forEach(btn => {
            // Remove existing listeners to avoid duplicates
            btn.removeEventListener('touchstart', handleTouchStart);
            btn.removeEventListener('touchend', handleTouchEnd);
            
            // Add new listeners
            btn.addEventListener('touchstart', handleTouchStart, { passive: true });
            btn.addEventListener('touchend', handleTouchEnd, { passive: true });
        });
        
        function handleTouchStart() {
            this.style.transform = 'scale(0.95)';
        }
        
        function handleTouchEnd() {
            setTimeout(() => {
                this.style.transform = '';
            }, 100);
        }
    }
    
    // Optimize scrolling performance
    function optimizeScrolling() {
        const chatMessages = document.querySelector('.chat-messages');
        if (!chatMessages) return;
        
        // Add momentum scrolling on iOS
        chatMessages.style.webkitOverflowScrolling = 'touch';
        chatMessages.style.overscrollBehavior = 'contain';
    }
    
    // Handle virtual keyboard
    function handleVirtualKeyboard() {
        if (!isMobile()) return;
        
        const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="password"]');
        
        inputs.forEach(input => {
            input.addEventListener('focus', function() {
                // Add class when keyboard is likely open
                setTimeout(() => {
                    document.body.classList.add('keyboard-open');
                    this.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            });
            
            input.addEventListener('blur', function() {
                document.body.classList.remove('keyboard-open');
            });
        });
    }
    
    // Prevent double-tap zoom on buttons
    function preventDoubleTapZoom() {
        let lastTouchEnd = 0;
        document.addEventListener('touchend', function(event) {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, { passive: false });
    }
    
    // Monitor animation state changes
    function monitorAnimationStates() {
        if (!isMobile()) return;
        
        // Watch for animation state changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.target.classList.contains('animation-state')) {
                    const activeState = document.querySelector('.animation-state.active');
                    if (activeState) {
                        if (activeState.classList.contains('idle')) {
                            updateMobileAnimation('idle');
                        } else if (activeState.classList.contains('user-speaking')) {
                            updateMobileAnimation('user-speaking');
                        } else if (activeState.classList.contains('ai-speaking')) {
                            updateMobileAnimation('ai-speaking');
                        } else if (activeState.classList.contains('processing')) {
                            updateMobileAnimation('processing');
                        }
                    }
                }
            });
        });
        
        // Start observing animation states
        const animationStates = document.querySelectorAll('.animation-state');
        animationStates.forEach(state => {
            observer.observe(state, { attributes: true, attributeFilter: ['class'] });
        });
    }
    
    // Fix button positioning on mobile
    function fixMobileButtonPositioning() {
        if (!isMobile()) return;
        
        // Ensure logout button doesn't overlap with controls
        const logoutBtn = document.querySelector('.btn-logout');
        const chatControls = document.querySelector('.chat-controls');
        
        if (logoutBtn && chatControls) {
            const controlsRect = chatControls.getBoundingClientRect();
            logoutBtn.style.bottom = `${window.innerHeight - controlsRect.top + 10}px`;
        }
    }
    
    // Initialize all mobile enhancements
    function init() {
        setViewportHeight();
        createMobileUI();
        enhanceTouchInteractions();
        optimizeScrolling();
        handleVirtualKeyboard();
        preventDoubleTapZoom();
        monitorAnimationStates();
        fixMobileButtonPositioning();
    }
    
    // Event listeners
    window.addEventListener('resize', () => {
        setViewportHeight();
        handleOrientationChange();
        fixMobileButtonPositioning();
    });
    
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            setViewportHeight();
            handleOrientationChange();
            fixMobileButtonPositioning();
        }, 100);
    });
    
    // Re-apply touch interactions when new buttons are added
    const observer = new MutationObserver(() => {
        enhanceTouchInteractions();
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Initialize when DOM is ready
    init();
    
    // Add mobile-specific styles dynamically
    if (isMobile()) {
        const style = document.createElement('style');
        style.textContent = `
            /* Mobile-specific animation styles */
            .mobile-idle-animation {
                width: 100%;
                height: 100%;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .mini-orbit {
                position: absolute;
                width: 60px;
                height: 60px;
                border: 2px solid var(--primary-color);
                border-radius: 50%;
                opacity: 0.3;
                animation: rotate 10s linear infinite;
            }
            
            .mini-core {
                width: 30px;
                height: 30px;
                background: radial-gradient(circle, var(--primary-color), var(--secondary-color));
                border-radius: 50%;
                animation: pulse 2s ease-in-out infinite;
            }
            
            .mobile-sound-waves {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                height: 100%;
            }
            
            .mobile-sound-waves span {
                width: 6px;
                height: 30px;
                background: linear-gradient(180deg, var(--success-color), var(--primary-color));
                border-radius: 3px;
                animation: soundWave 0.6s ease-in-out infinite;
            }
            
            .mobile-sound-waves span:nth-child(2) {
                height: 45px;
                animation-delay: 0.1s;
            }
            
            .mobile-sound-waves span:nth-child(3) {
                height: 30px;
                animation-delay: 0.2s;
            }
            
            .mobile-ai-pulse {
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .pulse-dot {
                width: 50px;
                height: 50px;
                background: radial-gradient(circle, var(--secondary-color), var(--accent-color));
                border-radius: 50%;
                animation: aiGlow 1.5s ease-in-out infinite;
            }
            
            .mobile-processing {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                height: 100%;
            }
            
            .mobile-processing span {
                width: 12px;
                height: 12px;
                background: var(--primary-color);
                border-radius: 50%;
                animation: processingDot 1.4s ease-in-out infinite;
            }
            
            .mobile-processing span:nth-child(2) {
                animation-delay: 0.2s;
            }
            
            .mobile-processing span:nth-child(3) {
                animation-delay: 0.4s;
            }
            
            @keyframes processingDot {
                0%, 60%, 100% {
                    transform: scale(1);
                    opacity: 1;
                }
                30% {
                    transform: scale(1.5);
                    opacity: 0.5;
                }
            }
            
            /* Ensure buttons are always accessible */
            .chat-controls {
                position: fixed !important;
                bottom: 0 !important;
                left: 0 !important;
                right: 0 !important;
                z-index: 1000 !important;
            }
            
            /* Fix scrolling issues */
            .chat-messages {
                height: calc(100vh - var(--mobile-header-height) - var(--mobile-controls-height)) !important;
                height: calc(calc(var(--vh, 1vh) * 100) - var(--mobile-header-height) - var(--mobile-controls-height)) !important;
            }
        `;
        document.head.appendChild(style);
    }
});

// Export for use in other modules
window.MobileEnhancements = {
    isMobile: () => window.matchMedia('(max-width: 768px)').matches,
    isTouchDevice: () => ('ontouchstart' in window) || (navigator.maxTouchPoints > 0),
    showAnimationPanel: () => {
        const panel = document.querySelector('.mobile-animation-panel');
        if (panel) panel.classList.add('show');
    },
    hideAnimationPanel: () => {
        const panel = document.querySelector('.mobile-animation-panel');
        if (panel) panel.classList.remove('show');
    }
};
