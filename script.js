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

	const searchForm = document.querySelector(".paper-search");
	if (searchForm) {
		const input = searchForm.querySelector("input");
		const clearButton = searchForm.querySelector("[data-clear-paper-search]");
		const status = searchForm.querySelector(".paper-search-status");
		const papers = Array.from(document.querySelectorAll(".paper-item"));
		const normalize = value => value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
		const indexedPapers = papers.map((paper, index) => {
			paper.value = index + 1;
			return { paper, text: normalize(paper.textContent) };
		});

		const updateSearch = () => {
			const query = normalize(input.value.trim());
			const terms = query.split(/\s+/).filter(Boolean);
			let matches = 0;
			indexedPapers.forEach(({ paper, text }) => {
				paper.hidden = !terms.every(term => text.includes(term));
				if (!paper.hidden) matches += 1;
			});
			clearButton.hidden = !input.value;
			document.getElementById("accepted-paper-list").hidden = matches === 0;
			status.hidden = !query;
			status.textContent = matches ? `${matches} matching ${matches === 1 ? "paper" : "papers"}` : "No papers match your search. Try another title or author.";
		};

		searchForm.hidden = false;
		searchForm.addEventListener("submit", event => event.preventDefault());
		input.addEventListener("input", updateSearch);
		clearButton.addEventListener("click", () => {
			input.value = "";
			updateSearch();
			input.focus();
		});
	}

	document.querySelectorAll("[data-print-program]").forEach(button => {
		button.hidden = false;
		button.addEventListener("click", () => window.print());
	});

	const papersNav = document.querySelector("[data-papers-nav]");
	if (papersNav && document.querySelector("#accepted-papers")) {
		const programNav = document.querySelector('.site-nav .nav-link.active');
		const updateSectionNav = () => {
			const showingPapers = window.location.hash === "#accepted-papers";
			papersNav.classList.toggle("active", showingPapers);
			if (programNav) programNav.classList.toggle("active", !showingPapers);
		};
		window.addEventListener("hashchange", updateSectionNav);
		updateSectionNav();
	}

	if (document.querySelector("[data-workshop-countdown], [data-workshop-journey]")) {
		const dayLength = 86400000;
		const startDay = Date.UTC(2026, 9, 15);
		const conferenceDay = Date.UTC(2026, 10, 9);
		const workshopDay = Date.UTC(2026, 10, 12);
		const workshopStart = Date.parse("2026-11-12T14:00:00-06:00");
		const workshopEnd = Date.parse("2026-11-12T18:00:00-06:00");
		const localDate = new Intl.DateTimeFormat("en-US", {
			timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit"
		});
		const shortDate = new Intl.DateTimeFormat("en-US", {
			timeZone: "America/Chicago", month: "short", day: "numeric"
		});
		const toDay = value => Date.parse(`${value}T00:00:00Z`);
		// Counts to the absolute start time, so it is right in every visitor's time zone.
		const countdownParts = msLeft => {
			const totalSeconds = Math.floor(msLeft / 1000);
			const days = Math.floor(totalSeconds / 86400);
			const hours = Math.floor(totalSeconds / 3600) % 24;
			const minutes = Math.floor(totalSeconds / 60) % 60;
			const seconds = totalSeconds % 60;
			const pad = value => String(value).padStart(2, "0");
			const parts = [];
			if (days > 0) parts.push([pad(days), days === 1 ? "day" : "days"]);
			if (days > 0 || hours > 0) parts.push([pad(hours), hours === 1 ? "hour" : "hours"]);
			parts.push([pad(minutes), "min"], [pad(seconds), "sec"]);
			return parts;
		};
		const countdownMessage = now => {
			if (now.getTime() >= workshopEnd) return "Workshop concluded";
			if (now.getTime() >= workshopStart) return "Workshop in progress";
			return null;
		};
		const countdownSpan = (className, text) => {
			const span = document.createElement("span");
			span.className = className;
			span.textContent = text;
			return span;
		};
		const updateCountdown = () => {
			const now = new Date();
			const message = countdownMessage(now);
			document.querySelectorAll("[data-workshop-countdown]").forEach(element => {
				element.textContent = message || "";
				if (!message) {
					countdownParts(workshopStart - now.getTime()).forEach(([value, unit], index) => {
						if (index > 0) {
							const colon = countdownSpan("countdown-colon", ":");
							colon.setAttribute("aria-hidden", "true");
							element.append(colon);
						}
						const part = countdownSpan("countdown-part", "");
						part.append(countdownSpan("countdown-value", value), countdownSpan("countdown-unit", unit));
						element.append(part);
					});
					element.append(countdownSpan("countdown-suffix", "to go"));
				}
				element.hidden = false;
			});
		};

		const updateWorkshopJourney = () => {
			const now = new Date();
			const dateParts = Object.fromEntries(localDate.formatToParts(now).map(part => [part.type, part.value]));
			const today = Date.UTC(Number(dateParts.year), Number(dateParts.month) - 1, Number(dateParts.day));
			const countdown = countdownMessage(now)
				|| `${countdownParts(workshopStart - now.getTime()).map(part => part.join(" ")).join(" ")} to go`;

			document.querySelectorAll("[data-workshop-journey]").forEach(journey => {
				const fraction = Math.max(0, Math.min(1, (today - startDay) / (workshopDay - startDay)));
				journey.style.setProperty("--journey-progress", `${fraction * 100}%`);
				journey.querySelector(".journey-progress").value = fraction * 100;
				journey.querySelector(".journey-progress").setAttribute("aria-valuetext", `${shortDate.format(now)}: ${countdown}`);
				journey.querySelector("[data-journey-live]").hidden = false;
				const inRange = today >= startDay && today <= workshopDay && now.getTime() < workshopEnd;
				const todayLabel = journey.querySelector("[data-journey-today]");
				todayLabel.textContent = `Today · ${shortDate.format(now)}`;
				todayLabel.hidden = !inRange;
				journey.querySelector("[data-journey-marker]").hidden = !inRange;
				const conferenceDaysLeft = Math.round((conferenceDay - today) / dayLength);
				const caption = journey.querySelector("[data-journey-caption]");
				caption.textContent = conferenceDaysLeft > 0
					? `${conferenceDaysLeft} ${conferenceDaysLeft === 1 ? "day" : "days"} until CoRL begins`
					: today < workshopDay ? "CoRL main conference is underway" : "November 12, 2026 · Austin, Texas";
				caption.hidden = false;

				let nextFound = false;
				journey.querySelectorAll("[data-milestone-date]").forEach(milestone => {
					const date = toDay(milestone.dataset.milestoneDate);
					const deadlineEnd = milestone.dataset.deadlineEnd ? Date.parse(milestone.dataset.deadlineEnd) : null;
					const rangeEnd = milestone.dataset.rangeEnd ? toDay(milestone.dataset.rangeEnd) : null;
					const passed = deadlineEnd !== null ? now.getTime() >= deadlineEnd
						: rangeEnd !== null ? today >= rangeEnd : today > date;
					const current = !passed && today >= date;
					const next = !passed && !nextFound;
					if (!passed) nextFound = true;
					milestone.classList.toggle("is-past", passed);
					milestone.classList.toggle("is-current", current);
					milestone.classList.toggle("is-next", next);
					let status = passed ? "Passed" : current ? (today === date ? "Today" : "Due soon") : next ? "Next" : "Upcoming";
					if (current && rangeEnd !== null) status = "In progress";
					if (milestone.hasAttribute("data-workshop-milestone") && current && now.getTime() >= workshopStart) status = "In progress";
					const label = milestone.querySelector("[data-milestone-status]");
					label.textContent = status;
					label.hidden = false;
				});
			});
		};
		updateWorkshopJourney();
		updateCountdown();
		window.setInterval(updateWorkshopJourney, 60000);
		window.setInterval(updateCountdown, 1000);
		document.addEventListener("visibilitychange", () => {
			if (!document.hidden) {
				updateWorkshopJourney();
				updateCountdown();
			}
		});
	}

	const video = document.querySelector(".hero-video");
	if (video && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		video.pause();
		video.removeAttribute("autoplay");
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
