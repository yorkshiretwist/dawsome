"use strict";

const Dawsome = () =>
	new Promise(async (resolve) => {
		// the audio stream
		let stream = null;
		// the audio source node
		let mediaStreamAudioSourceNode = null;
		// the audio element representing the recorded audio
		let audio = null;
		// the BLOB of recorded audio
		let audioBlob = null;
		// the URL for the recorded audio
		let audioUrl = null;
		// the media recorder instance
		let mediaRecorder = null;
		// the audio context instance
		let audioContext = null;
		// the array of audio data chunks
		const audioChunks = [];

		// references to UI elements
		const wrapper = document.getElementById("dawsome");
		const inputLevelMeter = document.getElementById("inputLevelMeter");
		const audioSourceSelect = document.getElementById("audioSource");
		const toggleRecordingButton = document.getElementById("toggleRecording");
		const togglePlaybackButton = document.getElementById("togglePlayback");
		const recorderStateEl = document.getElementById("recorderState");
        const canvas = document.getElementById("waveform");

		const prepare = () => {
			getStream().then(getDevices).then(startInputMeter);
			prepareUi();
		};

		const prepareUi = () => {
			toggleRecordingButton.addEventListener("click", toggleRecording);
			togglePlaybackButton.addEventListener("click", togglePlayback);
			recorderStateEl.innerText = "ready";
		};

		const prepareMediaRecorder = () => {
			mediaRecorder.addEventListener("dataavailable", (event) => {
				audioChunks.push(event.data);
			});
		};

		const getStream = () => {
			if (window.stream) {
				window.stream.getTracks().forEach((track) => {
					track.stop();
				});
			}
			const audioSource = audioSourceSelect.value;
			const constraints = {
				audio: { deviceId: audioSource ? { exact: audioSource } : undefined },
			};
			return navigator.mediaDevices
				.getUserMedia(constraints)
				.then(gotStream)
				.catch(handleError);
		};

		const gotStream = (mediaStream) => {
			stream = mediaStream;
			audioContext = new AudioContext();
			mediaStreamAudioSourceNode = audioContext.createMediaStreamSource(stream);
			window.stream = stream; // make stream available to console
			audioSourceSelect.selectedIndex = [
				...audioSourceSelect.options,
			].findIndex((option) => option.text === stream.getAudioTracks()[0].label);
			mediaRecorder = new MediaRecorder(stream);
			prepareMediaRecorder();
		};

		const buildWaveform = (blob) => {
			return new Promise((resolve, reject) => {
				const fileReader = new FileReader();
				fileReader.onloadend = () => {
					const arrayBuffer = fileReader.result;
					// Convert array buffer into audio buffer
					audioContext.decodeAudioData(arrayBuffer, (audioBuffer) => {
						// Do something with audioBuffer
						const pcm = audioBuffer.getChannelData(0);
						resolve(pcm);
					});
				};
				fileReader.onerror = reject;
				fileReader.readAsArrayBuffer(blob);
			});
		};

		const drawPCM = (values, playhead) => {
			const ctx = canvas.getContext("2d");
			let { width: clientWidth, height: clientHeight } = canvas;
			canvas.width = clientWidth;
			const scale = 2;
			ctx.scale(scale, scale);
			clientWidth /= scale; // scale down for pretty canvas
			clientHeight /= scale;
			const absoluteValues = true; // if false, we will retain the true waveform
			const valuesPerPixel = values.length / clientWidth;
			const blockSize = 1; // width of one sample block
			let max = 0;
			const averageValues = [];
			for (let x = 0; x < clientWidth; x += blockSize) {
				const area = values.slice(
					Math.floor(x * valuesPerPixel),
					Math.ceil((x + blockSize) * valuesPerPixel)
				);
				const areaReducer = absoluteValues
					? (sum, v) => sum + Math.abs(v)
					: (sum, v) => sum + v;
				const value = area.reduce(areaReducer, 0) / area.length;
				max = max < value ? value : max;
				averageValues.push(value);
			}
			averageValues.forEach((value, index) => {
				const height = (((value / max) * clientHeight) / 2) * 0.9;
				ctx.beginPath();
				ctx.strokeStyle = `#3535C3`;
				ctx.fillStyle = `#6464D8`;
				const args = [
					index * blockSize,
					clientHeight / 2 - (absoluteValues ? height / 2 : 0),
					blockSize,
					height,
				];
				const borderRadius = Math.floor(Math.min(args[2], args[3]) / 2);
				ctx.fillRect(
					index * blockSize,
					clientHeight / 2 - (absoluteValues ? height / 2 : 0),
					blockSize,
					height
				);
				ctx.stroke();
			});
			if (playhead) {
				ctx.beginPath();
				const x = playhead * clientWidth;
				ctx.moveTo(x, 0);
				ctx.lineTo(x, clientHeight);
				ctx.stroke();
			}
		}

		const startInputMeter = () => {
			const analyserNode = audioContext.createAnalyser();
			mediaStreamAudioSourceNode.connect(analyserNode);

			const pcmData = new Float32Array(analyserNode.fftSize);
			const onFrame = () => {
				analyserNode.getFloatTimeDomainData(pcmData);
				let sumSquares = 0.0;
				for (const amplitude of pcmData) {
					sumSquares += amplitude * amplitude;
				}
				inputLevelMeter.value = Math.sqrt(sumSquares / pcmData.length);
				window.requestAnimationFrame(onFrame);
			};
			window.requestAnimationFrame(onFrame);
		};

		const getDevices = () => {
			return navigator.mediaDevices.enumerateDevices().then(gotDevices);
		};

		const gotDevices = (deviceInfos) => {
			window.deviceInfos = deviceInfos; // make available to console
			for (const deviceInfo of deviceInfos) {
				const option = document.createElement("option");
				option.value = deviceInfo.deviceId;
				if (deviceInfo.kind === "audioinput") {
					option.text =
						deviceInfo.label || `Microphone ${audioSourceSelect.length + 1}`;
					audioSourceSelect.appendChild(option);
				}
			}
		};

		const toggleRecording = () => {
			if (toggleRecordingButton.classList.contains("recording")) {
				stopRecording();
			} else {
				startRecording();
			}
		};

		const startRecording = () => {
			toggleRecordingButton.classList.remove("record");
			toggleRecordingButton.classList.add("recording");
			toggleRecordingButton.title = "Stop";
			toggleRecordingButton.innerText = "Stop";
			mediaRecorder.start();
			recorderStateEl.innerText = mediaRecorder.state;
		};

		const stopRecording = () => {
			mediaRecorder.addEventListener("stop", () => {
				audioBlob = new Blob(audioChunks);
				audioUrl = URL.createObjectURL(audioBlob);
				audio = new Audio(audioUrl);
			});
			toggleRecordingButton.classList.remove("recording");
			toggleRecordingButton.classList.add("record");
			toggleRecordingButton.title = "Record";
			toggleRecordingButton.innerText = "Record";
			mediaRecorder.stop();
			recorderStateEl.innerText = mediaRecorder.state;
		};

		const togglePlayback = async () => {
			if (togglePlaybackButton.classList.contains("stop")) {
				setStopped();
				audio.removeEventListener("ended", setStopped);
				audio.pause();
			} else {
				setPlaying();
				audio.play();
				audio.addEventListener("ended", setStopped);
			}
		};

		const setStopped = () => {
			togglePlaybackButton.classList.remove("stop");
			togglePlaybackButton.classList.add("play");
			togglePlaybackButton.title = "Play";
			togglePlaybackButton.innerText = "Play";
		};

		const setPlaying = () => {
			togglePlaybackButton.classList.remove("play");
			togglePlaybackButton.classList.add("stop");
			togglePlaybackButton.title = "Stop";
			togglePlaybackButton.innerText = "Stop";
		};

		const handleError = (error) => {
			console.error("Error: ", error);
		};

		resolve({ startRecording, stopRecording, prepare });
	});

const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));

(async () => {
	if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
		return;
	}
	const daw = await Dawsome();
	daw.prepare();
})();
