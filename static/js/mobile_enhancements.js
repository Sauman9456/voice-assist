/**
 * Mobile UI Enhancements
 * Improves the mobile experience for the Voice Assistant app
 */

document.addEventListener('DOMContentLoaded', function() {
    // Check if device is mobile
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    
    // Create mobile menu toggle button
    function createMobileMenuToggle() {
        if (!isMobile) return;
        
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'mobile-menu-toggle';
        toggleBtn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
        `;
        toggleBtn.setAttribute('aria-label', 'Toggle animation panel');
        
        document.body.appendChild(toggleBtn);
        
        // Handle toggle click
        toggleBtn.addEventListener('click', toggleAnimationPanel);
    }
    
    // Toggle animation panel visibility
    function toggleAnimationPanel() {
        const leftPanel = document.querySelector('.left-panel');
        const chatContainer = document.querySelector('.chat-container');
        const toggleBtn = document.querySelector('.mobile-menu-toggle');
        
        if (!leftPanel) return;
        
        const isHidden = leftPanel.classList.contains('hidden');
        
        if (isHidden) {
            // Show panel
            leftPanel.classList.remove('hidden');
            chatContainer.style.paddingTop = '30vh';
            toggleBtn.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            `;
        } else {
            // Hide panel
            leftPanel.classList.add('hidden');
            chatContainer.style.paddingTop = '0';
            toggleBtn.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
            `;
        }
    }
    
    // Handle orientation changes
    function handleOrientationChange() {
        const leftPanel = document.querySelector('.left-panel');
        const chatContainer = document.querySelector('.chat-container');
        const toggleBtn = document.querySelector('.mobile-menu-toggle');
        
        const isLandscape = window.matchMedia('(orientation: landscape) and (max-height: 600px)').matches;
        const isMobileNow = window.matchMedia('(max-width: 768px)').matches;
        
        if (isLandscape) {
            // In landscape mode, show side panel
            if (leftPanel) leftPanel.classList.remove('hidden');
            if (chatContainer) chatContainer.style.paddingTop = '0';
            if (toggleBtn) toggleBtn.style.display = 'none';
        } else if (isMobileNow) {
            // In portrait mobile mode
            if (!toggleBtn) {
                createMobileMenuToggle();
            } else {
                toggleBtn.style.display = 'flex';
            }
            // Start with panel visible but allow toggle
            if (leftPanel && !leftPanel.classList.contains('hidden')) {
                if (chatContainer) chatContainer.style.paddingTop = '30vh';
            }
        } else {
            // Desktop mode
            if (leftPanel) leftPanel.classList.remove('hidden');
            if (chatContainer) chatContainer.style.paddingTop = '0';
            if (toggleBtn) toggleBtn.style.display = 'none';
        }
    }
    
    // Improve touch interactions
    function enhanceTouchInteractions() {
        if (!isTouchDevice) return;
        
        // Add touch feedback to buttons
        const buttons = document.querySelectorAll('.btn-control, .btn-logout, .btn-primary');
        buttons.forEach(btn => {
            btn.addEventListener('touchstart', function() {
                this.style.transform = 'scale(0.95)';
            });
            
            btn.addEventListener('touchend', function() {
                setTimeout(() => {
                    this.style.transform = '';
                }, 100);
            });
        });
        
        // Prevent double-tap zoom on buttons
        let lastTouchEnd = 0;
        document.addEventListener('touchend', function(event) {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
    }
    
    // Optimize scrolling performance
    function optimizeScrolling() {
        const chatMessages = document.querySelector('.chat-messages');
        if (!chatMessages) return;
        
        // Add passive listeners for better scroll performance
        chatMessages.addEventListener('touchstart', function() {}, { passive: true });
        chatMessages.addEventListener('touchmove', function() {}, { passive: true });
        
        // Add momentum scrolling on iOS
        chatMessages.style.webkitOverflowScrolling = 'touch';
    }
    
    // Viewport height fix for mobile browsers
    function setViewportHeight() {
        // Fix for mobile browsers with dynamic viewport height
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    
    // Handle virtual keyboard on mobile
    function handleVirtualKeyboard() {
        if (!isMobile) return;
        
        const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="password"]');
        
        inputs.forEach(input => {
            // Store original viewport height
            let originalHeight = window.innerHeight;
            
            input.addEventListener('focus', function() {
                // When keyboard opens, adjust layout
                setTimeout(() => {
                    const currentHeight = window.innerHeight;
                    if (currentHeight < originalHeight * 0.75) {
                        // Keyboard is likely open
                        document.body.classList.add('keyboard-open');
                        
                        // Scroll input into view
                        this.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 300);
            });
            
            input.addEventListener('blur', function() {
                // When keyboard closes
                document.body.classList.remove('keyboard-open');
            });
        });
    }
    
    // Optimize animations for mobile
    function optimizeAnimations() {
        if (!isMobile) return;
        
        // Reduce animation complexity on mobile
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        
        if (prefersReducedMotion) {
            document.body.classList.add('reduced-motion');
        }
        
        // Disable complex animations on low-end devices
        if (navigator.connection && navigator.connection.saveData) {
            document.body.classList.add('save-data');
        }
    }
    
    // Handle swipe gestures
    function handleSwipeGestures() {
        if (!isTouchDevice || !isMobile) return;
        
        const leftPanel = document.querySelector('.left-panel');
        if (!leftPanel) return;
        
        let touchStartY = 0;
        let touchEndY = 0;
        
        leftPanel.addEventListener('touchstart', function(e) {
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });
        
        leftPanel.addEventListener('touchend', function(e) {
            touchEndY = e.changedTouches[0].screenY;
            handleSwipe();
        }, { passive: true });
        
        function handleSwipe() {
            const swipeDistance = touchStartY - touchEndY;
            const threshold = 50;
            
            if (Math.abs(swipeDistance) > threshold) {
                if (swipeDistance > 0) {
                    // Swiped up - hide panel
                    leftPanel.classList.add('hidden');
                    document.querySelector('.chat-container').style.paddingTop = '0';
                    updateToggleButton();
                }
            }
        }
    }
    
    // Update toggle button icon
    function updateToggleButton() {
        const toggleBtn = document.querySelector('.mobile-menu-toggle');
        const leftPanel = document.querySelector('.left-panel');
        
        if (!toggleBtn || !leftPanel) return;
        
        if (leftPanel.classList.contains('hidden')) {
            toggleBtn.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
            `;
        } else {
            toggleBtn.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            `;
        }
    }
    
    // Initialize all mobile enhancements
    function init() {
        setViewportHeight();
        createMobileMenuToggle();
        enhanceTouchInteractions();
        optimizeScrolling();
        handleVirtualKeyboard();
        optimizeAnimations();
        handleSwipeGestures();
        handleOrientationChange();
    }
    
    // Event listeners
    window.addEventListener('resize', () => {
        setViewportHeight();
        handleOrientationChange();
    });
    
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            setViewportHeight();
            handleOrientationChange();
        }, 100);
    });
    
    // Initialize when DOM is ready
    init();
});

// Export for use in other modules if needed
window.MobileEnhancements = {
    isMobile: () => window.matchMedia('(max-width: 768px)').matches,
    isTouchDevice: () => ('ontouchstart' in window) || (navigator.maxTouchPoints > 0),
    togglePanel: () => {
        const event = new CustomEvent('toggleAnimationPanel');
        document.dispatchEvent(event);
    }
};
