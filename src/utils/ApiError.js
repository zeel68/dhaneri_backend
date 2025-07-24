// class ApiError extends Error {
//     constructor(
//         statusCode1,
//         message = "Something went wrong",


//     ) {
//         super(message)
//         this.statusCode1 = statusCode1

//         this.message = message
//         this.success = false;




//     }
// }
class ApiError {
    constructor(statusCode, message = "Success") {
        this.statusCode = statusCode
        this.message = message
        this.success = statusCode < 400
    }
}



export { ApiError }
