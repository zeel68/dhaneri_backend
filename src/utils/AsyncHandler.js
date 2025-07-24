export const asyncHandler = (fn) => {
    return async function (request, reply) {
        try {
            await fn(request, reply);
        } catch (err) {
            request.log.error(err);
            reply.status(500).send({ error: 'Something went wrong' });
        }
    };
};
