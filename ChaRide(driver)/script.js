// Initialize Supabase
const SUPABASE_URL = 'https://cvfjpigbkbzjvvfzvjzr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Wt2fAK6-5mkAX4SNyobCYQ_YPROnFM4';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Smooth scrolling for navbar links
document.querySelectorAll('.navbar a').forEach(link => {
    link.addEventListener('click', (e) => {
        if (link.getAttribute('href').startsWith('#')) {
            e.preventDefault();
            const target = document.querySelector(link.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        }
    });
});

// Contact form handling with Supabase
const contactForm = document.getElementById('contactForm');
if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('contactName').value;
        const email = document.getElementById('contactEmail').value;
        const message = document.getElementById('contactMessage').value;
        
        // Show loading state
        const submitBtn = contactForm.querySelector('.btn-submit');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;
        
        try {
            // Save to Supabase
            const { data, error } = await supabaseClient
                .from('contact_messages')
                .insert([
                    {
                        name: name,
                        email: email,
                        message: message
                    }
                ]);
            
            if (error) {
                console.error('Supabase error:', error);
                throw error;
            }
            
            // Show success message
            Swal.fire({
                icon: 'success',
                title: 'Message Sent!',
                text: 'Thank you for reaching out. We\'ll get back to you soon!',
                confirmButtonColor: '#0aa812'
            });
            
            // Reset form
            contactForm.reset();
            
        } catch (error) {
            console.error('Error details:', error);
            // Show error message
            Swal.fire({
                icon: 'error',
                title: 'Oops!',
                text: 'Failed to send message. Please try again later.',
                confirmButtonColor: '#0aa812'
            });
        } finally {
            // Reset button
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
}

// Book Now button handler
function orderNow() {
    Swal.fire({
        icon: 'info',
        title: 'Book Your Ride',
        text: 'Redirecting to booking page...',
        confirmButtonColor: '#0aa812',
        didClose: () => {
            window.location.href = 'login.html';
        }
    });
}

// Add animation on scroll
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

// Observe sections for scroll animation
document.querySelectorAll('.about-section, .services-section, .driver-section, .contact-section, .stats-section').forEach(section => {
    section.style.opacity = '0';
    section.style.transform = 'translateY(20px)';
    section.style.transition = 'all 0.6s ease';
    observer.observe(section);
});
