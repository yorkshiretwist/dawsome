"use strict";

const Dawsome = () =>
	new Promise(async (resolve) => {
		// the audio stream
		let userMediaStream = null;
		// the WaveformPlaylist instance
		let playlist;
		// constraints for getting the media device
		let constraints = { audio: true };
		// the event emitter instance
		let ee = null;
		// the current audio position
		let audioPosition = 0;
		// the download URL
		let downloadUrl = undefined;

		// references to UI elements
		const wrapper = document.getElementById("dawsome");
		const playlistContainer = document.getElementById("playlist");
		const inputLevelMeter = document.getElementById("inputLevelMeter");
		const audioSourceSelect = document.getElementById("audioSource");
		const toggleRecordingButton = document.getElementById("toggleRecording");
		const togglePlaybackButton = document.getElementById("togglePlayback");
		const clock = document.getElementById("clock");
		const resetTracksButton = document.getElementById("resetTracks");
		const returnPlayheadButton = document.getElementById("returnPlayhead");
		const frequencyAnalyserCanvas =
			document.getElementById("frequencyAnalyser");
		const masterGainInput = document.getElementById("masterGain");
		const renderButton = document.getElementById("render");
		const message = document.querySelector(".dawsome .message");
		const downloadLink = document.getElementById("downloadLink");

		// sets up dawsome
		const prepare = () => {
			initPlaylist();
			initUserMedia();
			prepareUi();
			prepareEventEmissions();
		};

		const initPlaylist = () => {
			playlist = WaveformPlaylist.init({
				// turn on the timescale
				timescale: true,
				isAutomaticScroll: true,
				waveHeight: 120,
				samplesPerPixel: 1000,
				zoomLevels: [1000, 5000, 9000],
				waveHeight: 100,
				container: playlistContainer,
				state: "cursor",
				controls: {
					// don't include track controls
					show: false,
				},
				colors: {
					// color of the wave background
					waveOutlineColor: "#202020",
					// color of the time ticks on the canvas
					timeColor: "#202020",
					// color of the fade drawn on canvas
					fadeColor: "#ccc",
				},
			});

			//initialize the WAV exporter.
			playlist.initExporter();

			// set up the event emitter
			ee = playlist.getEventEmitter();
		};

		const initUserMedia = () => {
			navigator.getUserMedia =
				navigator.getUserMedia ||
				navigator.webkitGetUserMedia ||
				navigator.mozGetUserMedia ||
				navigator.msGetUserMedia;

			if (navigator.mediaDevices) {
				navigator.mediaDevices
					.getUserMedia(constraints)
					.then(gotStream)
					.catch(logError);
			} else if (navigator.getUserMedia && "MediaRecorder" in window) {
				navigator.getUserMedia(constraints, gotStream, logError);
			}
		};

		// set up event listeners for UI elements
		const prepareUi = () => {
			setCanvasSizes();
			
			updateClock(audioPosition);
			
			toggleRecordingButton.disabled = false;
			toggleRecordingButton.addEventListener("click", toggleRecording);
			
			togglePlaybackButton.disabled = false;
			togglePlaybackButton.addEventListener("click", togglePlayback);
			
			resetTracksButton.disabled = false;
			resetTracksButton.addEventListener("click", resetTracks);
			
			returnPlayheadButton.disabled = false;
			returnPlayheadButton.addEventListener("click", returnPlayhead);
			
			masterGainInput.disabled = false;
			masterGainInput.addEventListener("change", changeMasterGain);

			renderButton.disabled = false;
			renderButton.addEventListener("click", startRendering);

			audioSourceSelect.disabled = false;

			window.addEventListener("resize", debounce(setCanvasSizes));
			wrapper.classList.remove("disabled");
			wrapper.classList.add("enabled");
		};

		const setCanvasSizes = () => {
			// get the width of the wrapper, so we can explicitely set the width of the other elements
			let wrapperWidth = wrapper.getBoundingClientRect().width;
			frequencyAnalyserCanvas.style.width =
				Math.round(wrapperWidth - 16) + "px";
		};

		const prepareEventEmissions = () => {
			ee.on("timeupdate", updateClock);

			ee.on("mute", function (track) {
				log("Mute button pressed for " + track.name);
			});

			ee.on("solo", function (track) {
				log("Solo button pressed for " + track.name);
			});

			ee.on("volumechange", function (volume, track) {
				log(track.name + " now has volume " + volume + ".");
			});

			ee.on("mastervolumechange", function (volume) {
				log("Master volume now has volume " + volume + ".");
			});

			var audioStates = ["uninitialized", "loading", "decoding", "finished"];

			ee.on("audiorequeststatechange", function (state, src) {
				var name = src;

				if (src instanceof File) {
					name = src.name;
				}

				log(
					"Track " + name + " is in state " + audioStates[state]
				);
			});

			ee.on("loadprogress", function (percent, src) {
				var name = src;

				if (src instanceof File) {
					name = src.name;
				}

				log("Track " + name + " has loaded " + percent + "%");
			});

			ee.on("audiosourcesloaded", function () {
				log("Tracks have all finished decoding.");
			});

			ee.on("audiosourcesrendered", function () {
				log("Tracks have been rendered");
			});

			ee.on("audiosourceserror", function (e) {
				logError(e);
			});

			ee.on("audiorenderingfinished", function (type, data) {
				if (type == "wav") {
					if (downloadUrl) {
						window.URL.revokeObjectURL(downloadUrl);
					}

					downloadUrl = window.URL.createObjectURL(data);
					var dateString = new Date().toISOString();
					let filename = "waveformplaylist" + dateString + ".wav";
					downloadLink.innerHTML = '<a href="' + downloadUrl + '" download="' + filename + '">Download</a>';
				}
			});

			ee.on("finished", function () {
				setStopped();
			});
		};

		const formatTime = (time) => {
			let minutes, secs;
			minutes = parseInt(time / 60, 10) % 60;
			secs = time % 60;
			secs = secs.toFixed(1);
			return (
				(minutes < 10 ? "0" + minutes : minutes) +
				":" +
				(secs < 10 ? "0" + secs : secs)
			);
		};

		// update the clock with the current time
		const updateClock = (time) => {
			clock.innerHTML = formatTime(time);
			audioPosition = time;
		};

		// invoked when the stream has been got, setting up the audio source
		function gotStream(stream) {
			userMediaStream = stream;
			playlist.initRecorder(userMediaStream);
			var sourceNode = playlist.ac.createMediaStreamSource(userMediaStream);
			startFrequencyAnalyser(sourceNode);
			startInputMeter(sourceNode);
			getDevices();
		}

		// starts the input meter
		const startInputMeter = (mediaStreamAudioSourceNode) => {
			// connect the input meter
			const analyserNode = playlist.ac.createAnalyser();
			mediaStreamAudioSourceNode.connect(analyserNode);
			const pcmData = new Float32Array(analyserNode.fftSize);
			const onFrame = () => {
				analyserNode.getFloatTimeDomainData(pcmData);
				let sumSquares = 0.0;
				for (const amplitude of pcmData) {
					sumSquares += amplitude * amplitude;
				}
				let val = Math.round(Math.sqrt(sumSquares / pcmData.length) * 1000); // TODO: this is an arbitrary number
				inputLevelMeter.style.width = 100 - val + "%";
				window.requestAnimationFrame(onFrame);
			};
			window.requestAnimationFrame(onFrame);
		};

		// start the frequency analyser
		const startFrequencyAnalyser = (mediaStreamAudioSourceNode) => {
			let canvasWidth = frequencyAnalyserCanvas.width;
			let canvasHeight = frequencyAnalyserCanvas.height;
			let frequencyAnalyserContext = frequencyAnalyserCanvas.getContext("2d");

			// connect the frequency analyser
			const frequencyAnalyserNode = playlist.ac.createAnalyser();
			frequencyAnalyserNode.fftSize = 1024;
			mediaStreamAudioSourceNode.connect(frequencyAnalyserNode);

			// analyzer draw code here
			const onFrame = () => {
				var SPACING = 3;
				var BAR_WIDTH = 1;
				var numBars = Math.round(canvasWidth / SPACING);
				var freqByteData = new Uint8Array(
					frequencyAnalyserNode.frequencyBinCount
				);
				frequencyAnalyserNode.getByteFrequencyData(freqByteData);
				frequencyAnalyserContext.clearRect(0, 0, canvasWidth, canvasHeight);
				frequencyAnalyserContext.fillStyle = "#F6D565";
				frequencyAnalyserContext.lineCap = "round";
				var multiplier = frequencyAnalyserNode.frequencyBinCount / numBars;
				var out = document.getElementById("out");
				// Draw rectangle for each frequency bin.
				for (var i = 0; i < numBars; ++i) {
					var magnitude = 0;
					var offset = Math.floor(i * multiplier);
					// gotta sum/average the block, or we miss narrow-bandwidth spikes
					for (var j = 0; j < multiplier; j++) {
						magnitude += freqByteData[offset + j];
					}
					// the max value is 255, so work out the percentage
					magnitude = (magnitude / multiplier / 255) * 100;
					// now work out what the percentage is of the client height
					magnitude = (magnitude / 100) * canvasHeight;
					frequencyAnalyserContext.fillStyle =
						"hsl( " + Math.round((i * 360) / numBars) + ", 100%, 50%)";
					frequencyAnalyserContext.fillRect(
						i * SPACING,
						canvasHeight,
						BAR_WIDTH,
						-magnitude
					);
				}
				window.requestAnimationFrame(onFrame);
			};
			window.requestAnimationFrame(onFrame);
		};

		// invoked when the list of devices has been fetched; populates the input selector
		function getDevices() {
			navigator.mediaDevices.enumerateDevices().then(function (deviceInfos) {
				while (audioSourceSelect.lastChild) {
					audioSourceSelect.removeChild(audioSourceSelect.lastChild);
				}
				for (const deviceInfo of deviceInfos) {
					const option = document.createElement("option");
					option.value = deviceInfo.deviceId;
					if (deviceInfo.kind === "audioinput") {
						option.text =
							deviceInfo.label || `Microphone ${audioSourceSelect.length + 1}`;
						audioSourceSelect.appendChild(option);
					}
				}
			});
		}

		// change the master gain
		const changeMasterGain = (e) => {
			ee.emit("mastervolumechange", e.target.value);
		};

		// starts rendering of the files
		const startRendering = () => {
			var tracks = document.querySelectorAll("#playlist .playlist-tracks .channel-wrapper");
			if (!tracks || !tracks.length) {
				setMessage("No tracks to render");
				return;
			}
			ee.emit('startaudiorendering', 'wav');
		};

		// starts or stop recording, based on the state of the recorder
		const toggleRecording = () => {
			if (toggleRecordingButton.classList.contains("recording")) {
				stopRecording();
			} else {
				startRecording();
			}
		};

		// reset the recording by discarding all the audio chunks and deleting the player
		const resetTracks = () => {
			if (toggleRecordingButton.classList.contains("recording")) {
				return;
			}
			setStopped();
			ee.emit("clear");
			updateClock(0);
			resetDownload();
		};

		// remove the download link
		const resetDownload = () => {
			downloadLink.innerHTML = '';
		};

		// start recording
		const startRecording = () => {
			// set up the UI
			swapClasses(toggleRecordingButton, "record", "recording");
			toggleRecordingButton.title = "Stop";
			toggleRecordingButton.innerText = "Stop";
			setMessage("Recording...");
			resetDownload();
			// clear the previous track - we only allow one track to be recorded
			ee.emit("clear");
			// start recording
			ee.emit("record");
		};

		// stops recording, making the recorded audio available to the player
		const stopRecording = () => {
			// set up the UI
			swapClasses(toggleRecordingButton, "recording", "record");
			toggleRecordingButton.title = "Record";
			toggleRecordingButton.innerText = "Record";
			setMessage("Recording finished");
			// stop the recording
			setStopped();
			ee.emit("stop");
		};

		// play or pause, depending on the current state of the player
		const togglePlayback = async () => {
			if (toggleRecordingButton.classList.contains("recording")) {
				return;
			}
			if (togglePlaybackButton.classList.contains("playing")) {
				setPaused();
				ee.emit("pause");
			} else {
				setPlaying();
				ee.emit("play");
			}
		};

		// return the playhead to the start
		const returnPlayhead = () => {
			if (toggleRecordingButton.classList.contains("recording")) {
				return;
			}
			setStopped();
			ee.emit("rewind");
		};

		// set the player as stopped because the end of the audio has been reached
		const setStopped = () => {
			swapClasses(togglePlaybackButton, "playing", "play");
			togglePlaybackButton.title = "Play";
			togglePlaybackButton.innerText = "Play";
			setMessage("Ready");
		};

		// set the player as paused
		const setPaused = () => {
			swapClasses(togglePlaybackButton, "playing", "play");
			togglePlaybackButton.title = "Play";
			togglePlaybackButton.innerText = "Play";
			setMessage("Paused");
		};

		// set the player as playing
		const setPlaying = () => {
			swapClasses(togglePlaybackButton, "play", "playing");
			togglePlaybackButton.title = "Pause";
			togglePlaybackButton.innerText = "Pause";
			setMessage("Playing...");
		};

		// swap CSS classes on an element
		const swapClasses = (element, classToRemove, classToAdd) => {
			element.classList.remove(classToRemove);
			element.classList.add(classToAdd);
		};

		const setMessage = (msg) => {
			message.innerHTML = msg;
		};

		const log = (msg) => {
			if (!window.console) {
				return;
			}
			console.log(msg);
		};

		const logError = (error) => {
			if (!window.console) {
				return;
			}
			console.error(error);
		};

		const debounce = (func, wait, immediate) => {
			var timeout;
			return function () {
				var context = this,
					args = arguments;
				var later = function () {
					timeout = null;
					if (!immediate) func.apply(context, args);
				};
				var callNow = immediate && !timeout;
				clearTimeout(timeout);
				timeout = setTimeout(later, wait);
				if (callNow) func.apply(context, args);
			};
		};

		resolve({ startRecording, stopRecording, prepare });
	});

const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));

(async () => {
	if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
		return;
	}
	const daw = await Dawsome();
	let enablerButton = document.getElementById("enableDawsome");
	enablerButton.addEventListener("click", function(){
		daw.prepare();
	});
})();
