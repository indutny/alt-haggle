import * as Joi from 'joi';

export const Packet = Joi.object().keys({
  seq: Joi.number().required(),
  payload: Joi.object().required(),
});

export const StepResponse = Joi.object().keys({
  kind: Joi.string().valid('step').required(),
  game: Joi.string().required(),
  offer: Joi.array().items(Joi.number()),
});
