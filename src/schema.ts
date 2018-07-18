import * as Joi from 'joi';

export const Packet = Joi.object().keys({
  seq: Joi.number().required(),
  payload: Joi.object().required(),
});

export const InitResponse = Joi.object().keys({
  kind: Joi.string().valid('init').required(),
  challenge: Joi.string().hex().min(64).max(64).required(),
});

export const StartResponse = Joi.object().keys({
  kind: Joi.string().valid('start').required(),
});

export const StepResponse = Joi.object().keys({
  kind: Joi.string().valid('step').required(),
  game: Joi.string().required(),
  offer: Joi.array().items(Joi.number()),
});
