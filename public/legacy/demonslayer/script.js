document.addEventListener("DOMContentLoaded", function () {
            // Page Loader
            document.documentElement.classList.add("overflow-hidden");
            document.body.classList.add("overflow-hidden");
            setTimeout(function () {
                document.getElementById("pageLoader").style.display = "none";
                document.documentElement.classList.remove("overflow-hidden");
                document.body.classList.remove("overflow-hidden");
            }, 3000);
        });
                
        // Swiper JS
        var swiper = new Swiper('.swiper-container', {
            slidesPerView: 1, // Default number of slides per view (for small screens)
            spaceBetween: 12,
            freeMode: true,
            Infinity: true,
            breakpoints: {
                576: {
                    slidesPerView: 2, 
                    spaceBetween: 12
                },
                767: {
                    slidesPerView: 3, 
                    spaceBetween: 12
                }
            }
        });

        // Title 
        window.onload = function () {
            // Select the h1 element
            var title = document.querySelector('h1');
            // Split the title into individual characters
            var split = new SplitType(title, { types: 'chars' });
            // Animate each character from opacity 0 to opacity 1
            gsap.from(split.chars, {
                duration: 0.6,
                opacity: 0,
                x: 20,
                stagger: 0.1,
                ease: 'back'
            });
        }

        // Banner Image - GSAP
        var images = gsap.utils.toArray('.banner-img img');
        var tl = gsap.timeline({ repeat: 0, repeatDelay: 1 });
        // Centre image
        tl.from(images[Math.floor(images.length / 2)], {
            duration: 1,
            opacity: 0,
            y: -50,
            ease: 'power1.out',
            delay: 3.1,
        });
        // Final image
        tl.from(images[images.length - 1], {
            duration: 1,
            opacity: 0,
            y: -50,
            ease: 'power1.out'
        }, "-=0.5");
        // Second image
        tl.from(images[1], {
            duration: 1,
            opacity: 0,
            y: -50,
            ease: 'power1.out'
        }, "-=0.5");
        // Fourth image
        tl.from(images[3], {
            duration: 1,
            opacity: 0,
            y: -50,
            ease: 'power1.out'
        }, "-=0.5");
        // First image
        tl.from(images[0], {
            duration: 1,
            opacity: 0,
            y: -50,
            ease: 'power1.out'
        }, "-=0.5");