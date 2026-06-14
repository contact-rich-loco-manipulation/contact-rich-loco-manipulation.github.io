document.addEventListener("DOMContentLoaded", () => {
	const nav = document.querySelector(".site-nav");
	if (nav) {
		const updateNavOffset = () => {
			document.documentElement.style.setProperty("--nav-height", `${Math.ceil(nav.getBoundingClientRect().height)}px`);
		};

		updateNavOffset();
		window.addEventListener("load", updateNavOffset);
		window.addEventListener("resize", updateNavOffset);

		if ("ResizeObserver" in window) {
			const resizeObserver = new ResizeObserver(updateNavOffset);
			resizeObserver.observe(nav);
		}

		if (document.fonts && document.fonts.ready) {
			document.fonts.ready.then(updateNavOffset).catch(() => {});
		}

		const navMenu = document.getElementById("siteNav");
		const navToggle = nav.querySelector(".navbar-toggler");
		const isMobileNav = () => navToggle && window.getComputedStyle(navToggle).display !== "none";
		const syncNavState = () => {
			const isExpanded = Boolean(navToggle && navToggle.getAttribute("aria-expanded") === "true" && isMobileNav());
			document.body.classList.toggle("nav-is-open", isExpanded);
			updateNavOffset();
		};

		if (navMenu) {
			navMenu.addEventListener("shown.bs.collapse", syncNavState);
			navMenu.addEventListener("hidden.bs.collapse", syncNavState);

			navMenu.querySelectorAll(".nav-link").forEach(link => {
				link.addEventListener("click", () => {
					if (!isMobileNav() || !navMenu.classList.contains("show")) {
						return;
					}

					if (window.jQuery) {
						window.jQuery(navMenu).collapse("hide");
					}
				});
			});
		}

		window.addEventListener("resize", syncNavState);
		syncNavState();
	}

	const revealItems = Array.from(document.querySelectorAll("[data-reveal]"));
	if (revealItems.length) {
		const observer = new IntersectionObserver(
			entries => {
				entries.forEach(entry => {
					if (entry.isIntersecting) {
						entry.target.classList.add("is-visible");
						observer.unobserve(entry.target);
					}
				});
			},
			{ threshold: 0.15 }
		);

		revealItems.forEach((item, index) => {
			item.style.setProperty("--reveal-delay", `${Math.min(index % 6, 5) * 70}ms`);
			observer.observe(item);
		});
	}

});
