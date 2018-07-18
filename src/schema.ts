import * as Joi from 'joi';

export const Packet = Joi.object().keys({
  seq: Joi.number().required(),
  payload: Joi.object().required(),
});

export const InitResponse = Joi.object().keys({
  kind: Joi.string().valid('init').required(),
  name: Joi.string().required(),
  challenge: Joi.string().hex().min(32).max(32).required(),
});

export const StartResponse = Joi.object().keys({
  kind: Joi.string().valid('start').required(),
});

export const EndResponse = Joi.object().keys({
  kind: Joi.string().valid('end').required(),
});

export const StepResponse = Joi.object().keys({
  kind: Joi.string().valid('step').required(),
  offer: Joi.array().items(Joi.number()),
});
