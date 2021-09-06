import {getWaveformSamples} from './get-wave-form-samples';
import {AudioData} from './types';

type Bar = {
	index: number;
	amplitude: number;
};

const getWaveformPortion = ({
	audioData,
	startTimeInSeconds,
	durationInSeconds,
	numberOfSamples,
	normalize,
}: {
	audioData: AudioData;
	startTimeInSeconds: number;
	durationInSeconds: number;
	numberOfSamples: number;
	normalize: boolean;
}): Bar[] => {
	const startSample = Math.floor(
		(startTimeInSeconds / audioData.durationInSeconds) *
			audioData.channelWaveforms[0].length
	);
	const endSample = Math.floor(
		((startTimeInSeconds + durationInSeconds) / audioData.durationInSeconds) *
			audioData.channelWaveforms[0].length
	);

	return getWaveformSamples(
		audioData.channelWaveforms[0].slice(startSample, endSample),
		numberOfSamples,
		normalize
	).map((w, i) => {
		return {
			index: i,
			amplitude: w,
		};
	});
};

export {getWaveformPortion, Bar};
