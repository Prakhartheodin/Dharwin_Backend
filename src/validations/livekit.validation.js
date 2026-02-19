import Joi from 'joi';

const getToken = {
  body: Joi.object().keys({
    roomName: Joi.string().required().trim(),
    participantName: Joi.string().optional().trim(),
  }),
};

const startRecording = {
  body: Joi.object().keys({
    roomName: Joi.string().required().trim(),
  }),
};

const stopRecording = {
  body: Joi.object().keys({
    egressId: Joi.string().required().trim(),
  }),
};

const getRecordingStatus = {
  params: Joi.object().keys({
    roomName: Joi.string().required().trim(),
  }),
};

export { getToken, startRecording, stopRecording, getRecordingStatus };
