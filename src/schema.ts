import * as Joi from 'joi';

export const Packet = Joi.object().keys({
  seq: Joi.number().required(),
  payload: Joi.object().required(),
});
